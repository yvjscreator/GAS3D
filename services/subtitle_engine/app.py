from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field
from .mockup_library import router as mockup_library_router
from .auth import AuthenticationGuard, router as auth_router, session_user

APP_NAME = "GAS3D Subtitle Engine"
GEMINI_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-transcribe")
SCRIPT_MODEL = os.getenv("GEMINI_SCRIPT_MODEL", "gemini-3.8-flash")
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
SCRIPT_MODELS = [
    item.strip()
    for item in os.getenv(
        "GEMINI_SCRIPT_MODELS",
        "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash",
    ).split(",")
    if item.strip()
]
TTS_MODELS = [
    item.strip()
    for item in os.getenv(
        "GEMINI_TTS_MODELS",
        "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts",
    ).split(",")
    if item.strip()
]
TRANSCRIBE_MODELS = [
    item.strip()
    for item in os.getenv(
        "GEMINI_TRANSCRIBE_MODELS",
        GEMINI_MODEL,
    ).split(",")
    if item.strip()
]
AI_RETRIES_PER_MODEL = max(0, int(os.getenv("AI_RETRIES_PER_MODEL", "3")))
AI_RETRY_DELAYS = [
    float(item.strip())
    for item in os.getenv("AI_RETRY_DELAYS", "1.5,3,6").split(",")
    if item.strip()
]
AI_LOG_LIMIT = max(50, int(os.getenv("AI_LOG_LIMIT", "300")))
VOICE_CATALOG_TTL_SECONDS = max(
    300,
    int(os.getenv("VOICE_CATALOG_TTL_SECONDS", str(24 * 60 * 60))),
)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "SUBTITLE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
WORK_ROOT = Path(
    os.getenv(
        "SUBTITLE_WORK_DIR",
        Path(tempfile.gettempdir()) / "gas3d-subtitles",
    )
)
WORK_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME)
app.include_router(auth_router)
app.include_router(mockup_library_router)
app.add_middleware(AuthenticationGuard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-AI-Model"],
)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_ai_logs: dict[str, list[dict]] = {}
_ai_logs_lock = threading.Lock()
_voice_catalog_cache: dict[str, object] = {"expiresAt": 0.0, "voices": []}
_voice_catalog_lock = threading.Lock()
_executor = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("TRANSCRIBE_WORKERS", "2")))
)


SCRIPT_DEADLINE_SECONDS = 160
SCRIPT_JOB_RETENTION_SECONDS = 1800
SCRIPT_UPLOAD_LIMIT = 250 * 1024 * 1024
SCRIPT_CONCURRENCY = 2
_script_executor = ThreadPoolExecutor(max_workers=SCRIPT_CONCURRENCY)
_script_jobs: dict[str, dict] = {}
_script_lock = threading.Lock()


class PresentationSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    purpose: str
    label: str | None = None
    visibleText: str | None = None
    text: str


class PresentationScriptResult(BaseModel):
    title: str
    detectedProduct: str
    summary: str
    script: str
    estimatedSeconds: float = Field(gt=0)
    visualNotes: list[str] = Field(default_factory=list)
    segments: list[PresentationSegment] = Field(default_factory=list)


class TTSRequest(BaseModel):
    script: str = Field(min_length=1, max_length=12000)
    voice: str = Field(default="Sulafat", min_length=1, max_length=128)
    styleId: str = Field(default="influencer", min_length=1, max_length=64)
    language: str = Field(default="es-LATAM", min_length=1, max_length=64)


TTS_STYLES = {
    "influencer": (
        "Natural social-media creator presenting a product to camera. Warm, spontaneous, "
        "conversational and confident. Sound genuinely impressed, never like a formal announcer. "
        "Use an engaging medium pace with natural micro-pauses."
    ),
    "reels": (
        "High-energy short-form social media creator. Strong hook, lively inflection, quick but "
        "clear pace, punchy emphasis on benefits, energetic without shouting."
    ),
    "friendly": (
        "Friendly product recommender speaking directly to one person. Warm, approachable, "
        "trustworthy and persuasive without sounding scripted. Relaxed medium pace."
    ),
    "premium": (
        "Polished premium product presenter. Elegant, calm confidence, controlled enthusiasm, "
        "clean articulation and measured pacing. Sophisticated rather than salesy."
    ),
    "casual": (
        "Casual relaxed creator speaking to a friend. Natural rhythm, easygoing delivery, subtle "
        "smiles in the voice and believable conversational pauses."
    ),
    "commercial": (
        "Professional modern commercial presenter. Clear articulation, confident energy, concise "
        "pacing and strong benefit-led emphasis while remaining human."
    ),
}

LANGUAGE_STYLES = {
    "es-LATAM": "Speak in natural neutral Latin American Spanish.",
    "es-CL": "Speak in natural Chilean Spanish with a clear, accessible Chilean accent.",
    "es-AR": "Speak in natural Rioplatense Spanish from Argentina.",
    "es-VE": "Speak in natural Venezuelan Spanish.",
    "en-US": "Speak in natural American English.",
    "pt-BR": "Speak in natural Brazilian Portuguese.",
}


def _new_genai_client(timeout_ms: int | None = None) -> genai.Client:
    return genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=genai_types.HttpOptions(
            timeout=timeout_ms,
            retry_options=genai_types.HttpRetryOptions(attempts=1),
        ),
    )


def _session_id(value: str | None) -> str:
    clean = (value or "").strip()
    return clean[:96] if clean else "anonymous"


def _log_ai(
    session_id: str | None,
    operation: str,
    level: str,
    message: str,
    *,
    model: str | None = None,
    attempt: int | None = None,
    error: object | None = None,
    duration_ms: int | None = None,
) -> None:
    sid = _session_id(session_id)
    event = {
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "operation": operation,
        "level": level,
        "message": message,
        "model": model,
        "attempt": attempt,
        "durationMs": duration_ms,
        "error": str(error) if error is not None else None,
    }
    with _ai_logs_lock:
        bucket = _ai_logs.setdefault(sid, [])
        bucket.append(event)
        if len(bucket) > AI_LOG_LIMIT:
            del bucket[:-AI_LOG_LIMIT]


def _retryable_ai_error(exc: Exception) -> bool:
    code = (
        getattr(exc, "status_code", None)
        or getattr(exc, "code", None)
        or getattr(getattr(exc, "response", None), "status_code", None)
    )
    try:
        numeric = int(code) if code is not None else None
    except (TypeError, ValueError):
        numeric = None

    if numeric in {408, 429, 500, 502, 503, 504}:
        return True

    text = str(exc).lower()
    transient_terms = (
        "resource_exhausted",
        "rate limit",
        "rate_limit",
        "too many requests",
        "unavailable",
        "service unavailable",
        "overloaded",
        "deadline",
        "timeout",
        "timed out",
        "temporarily",
        "connection reset",
        "internal server error",
    )
    return any(term in text for term in transient_terms)


def _retry_delay(attempt: int) -> float:
    if not AI_RETRY_DELAYS:
        return 1.5
    index = min(max(0, attempt - 1), len(AI_RETRY_DELAYS) - 1)
    return AI_RETRY_DELAYS[index]


def _run_ai_with_fallback(
    operation: str,
    session_id: str | None,
    models: list[str],
    call,
    *,
    max_retries: int | None = None,
):
    if not models:
        raise RuntimeError(f"No hay modelos configurados para {operation}.")

    last_error: Exception | None = None
    retries = AI_RETRIES_PER_MODEL if max_retries is None else max_retries

    for model_index, model in enumerate(models):
        for attempt in range(1, retries + 2):
            started = time.monotonic()
            _log_ai(
                session_id,
                operation,
                "info",
                "Iniciando solicitud.",
                model=model,
                attempt=attempt,
            )
            try:
                result = call(model)
                elapsed = int((time.monotonic() - started) * 1000)
                _log_ai(
                    session_id,
                    operation,
                    "success",
                    "Solicitud completada.",
                    model=model,
                    attempt=attempt,
                    duration_ms=elapsed,
                )
                return result, model
            except Exception as exc:
                last_error = exc
                elapsed = int((time.monotonic() - started) * 1000)
                retryable = _retryable_ai_error(exc)
                _log_ai(
                    session_id,
                    operation,
                    "warning" if retryable else "error",
                    "Solicitud fallida.",
                    model=model,
                    attempt=attempt,
                    error=exc,
                    duration_ms=elapsed,
                )

                if not retryable:
                    raise

                if attempt <= retries:
                    delay = _retry_delay(attempt)
                    _log_ai(
                        session_id,
                        operation,
                        "info",
                        f"Reintentando en {delay:g} s.",
                        model=model,
                        attempt=attempt,
                    )
                    time.sleep(delay)

        if model_index < len(models) - 1:
            _log_ai(
                session_id,
                operation,
                "warning",
                f"Degradando al siguiente modelo: {models[model_index + 1]}.",
                model=model,
                attempt=retries + 1,
                error=last_error,
            )

    raise last_error or RuntimeError(f"{operation} falló sin un error detallado.")


def _run(command: list[str], timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise RuntimeError(f"No se encontró {command[0]}.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(detail[-1800:] or f"Falló {command[0]}.") from exc


def _parse_rate(rate: str | None) -> float | None:
    if not rate:
        return None
    try:
        if "/" in rate:
            numerator, denominator = rate.split("/", 1)
            denominator_value = float(denominator)
            return float(numerator) / denominator_value if denominator_value else None
        return float(rate)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _probe(path: Path, timeout: float | None = None) -> dict:
    result = _run([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height,r_frame_rate",
        "-of",
        "json",
        str(path),
    ], timeout=timeout)
    payload = json.loads(result.stdout)
    video = next(
        (
            stream
            for stream in payload.get("streams", [])
            if stream.get("codec_type") == "video"
        ),
        {},
    )
    duration = payload.get("format", {}).get("duration")
    return {
        "duration": float(duration) if duration is not None else None,
        "width": int(video["width"]) if video.get("width") else None,
        "height": int(video["height"]) if video.get("height") else None,
        "fps": _parse_rate(video.get("r_frame_rate")),
    }


def _extract_audio(input_path: Path, output_path: Path) -> None:
    _run([
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "flac",
        str(output_path),
    ])


def _offset_seconds(value: object) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)s", text)
    if match:
        return float(match.group(1))
    try:
        return float(text)
    except ValueError:
        return 0.0


def _extract_word_annotations(interaction: object) -> list[dict]:
    words: list[dict] = []
    for step in getattr(interaction, "steps", []) or []:
        for content in getattr(step, "content", []) or []:
            for annotation in getattr(content, "annotations", []) or []:
                if getattr(annotation, "type", None) != "word_info":
                    continue

                text = (getattr(annotation, "text", "") or "").strip()
                if not text:
                    continue

                start = max(
                    0.0,
                    _offset_seconds(getattr(annotation, "start_offset", None)),
                )
                end = max(
                    start + 0.01,
                    _offset_seconds(getattr(annotation, "end_offset", None)),
                )
                words.append({
                    "id": len(words),
                    "text": text,
                    "start": start,
                    "end": end,
                    "speaker": getattr(annotation, "speaker", None),
                })
    return words


def _group_words(words: list[dict], max_words: int = 5) -> list[dict]:
    groups: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        groups.append({
            "id": len(groups),
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "wordIds": [word["id"] for word in current],
        })
        current = []

    for word in words:
        previous = current[-1] if current else None
        if previous and word["start"] - previous["end"] > 0.7:
            flush()
        current.append(word)
        if len(current) >= max_words or word["text"].endswith((".", "!", "?", "…")):
            flush()

    flush()
    return groups


def _public_job(job: dict) -> dict:
    return {
        "id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
        "fileName": job["fileName"],
        "language": job.get("language"),
        "duration": job.get("duration"),
        "width": job.get("width"),
        "height": job.get("height"),
        "fps": job.get("fps"),
        "words": job.get("words", []),
        "captions": job.get("captions", []),
        "error": job.get("error"),
    }


def _update_job(job_id: str, **changes) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(changes)


def _delete_remote_file(client: genai.Client | None, remote_file: object | None) -> None:
    if client is None or remote_file is None:
        return
    try:
        client.files.delete(name=remote_file.name)
    except Exception:
        pass


def _wait_for_gemini_file(
    client: genai.Client,
    remote_file: object,
    timeout_seconds: int = 180,
):
    deadline = time.monotonic() + timeout_seconds
    current = remote_file

    while time.monotonic() < deadline:
        state = getattr(getattr(current, "state", None), "name", None)
        if state in (None, "ACTIVE"):
            return current
        if state == "FAILED":
            raise RuntimeError("Gemini no pudo procesar el archivo.")

        time.sleep(2)
        current = client.files.get(name=current.name)

    raise RuntimeError("Gemini tardó demasiado en procesar el archivo.")


def _transcribe(job_id: str) -> None:
    with _jobs_lock:
        job = dict(_jobs[job_id])

    input_path = Path(job["inputPath"])
    job_dir = input_path.parent
    audio_path = job_dir / "speech.flac"
    remote_file = None
    client = None

    try:
        if not GEMINI_API_KEY:
            raise RuntimeError("Falta configurar GEMINI_API_KEY en Render.")

        _update_job(
            job_id,
            status="transcribing",
            progress=0.08,
            message="Preparando audio…",
        )
        _extract_audio(input_path, audio_path)

        _update_job(
            job_id,
            progress=0.22,
            message="Subiendo audio a Gemini…",
        )
        client = _new_genai_client()
        remote_file = client.files.upload(file=str(audio_path))

        transcription_config: dict = {
            "mode": {
                "type": "verbatim",
                "timestamp_granularities": ["word"],
            }
        }

        requested_language = job.get("requestedLanguage")
        if requested_language:
            transcription_config["language_codes"] = [requested_language]

        _update_job(
            job_id,
            progress=0.38,
            message=f"Transcribiendo con {GEMINI_MODEL}…",
        )
        def transcribe_with_model(model: str):
            return client.interactions.create(
                model=model,
                input=[{
                    "type": "audio",
                    "uri": remote_file.uri,
                    "mime_type": remote_file.mime_type,
                }],
                generation_config={
                    "transcription_config": transcription_config,
                },
            )

        interaction, used_model = _run_ai_with_fallback(
            "transcription",
            job.get("aiSessionId"),
            TRANSCRIBE_MODELS,
            transcribe_with_model,
        )

        words = _extract_word_annotations(interaction)
        if not words:
            raise RuntimeError(
                "Gemini terminó la transcripción, pero no devolvió timestamps por palabra."
            )

        _update_job(
            job_id,
            status="ready",
            progress=1.0,
            message=f"Transcripción lista · {len(words)} palabras · {used_model}",
            words=words,
            captions=_group_words(words),
            error=None,
        )
    except Exception as exc:
        _log_ai(
            job.get("aiSessionId"),
            "transcription",
            "error",
            "El pipeline de transcripción terminó con error.",
            error=exc,
        )
        _update_job(
            job_id,
            status="error",
            progress=1.0,
            message="La transcripción falló.",
            error=str(exc),
        )
    finally:
        _delete_remote_file(client, remote_file)
        shutil.rmtree(job_dir, ignore_errors=True)


@app.get("/api/subtitles/ai/logs/{session_id}")
def get_ai_logs(session_id: str) -> dict:
    sid = _session_id(session_id)
    with _ai_logs_lock:
        items = list(_ai_logs.get(sid, []))
    return {
        "sessionId": sid,
        "items": items,
        "count": len(items),
    }


@app.delete("/api/subtitles/ai/logs/{session_id}")
def clear_ai_logs(session_id: str) -> dict:
    sid = _session_id(session_id)
    with _ai_logs_lock:
        _ai_logs.pop(sid, None)
    return {"ok": True, "sessionId": sid}


@app.get("/api/subtitles/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "gemini",
        "model": GEMINI_MODEL,
        "scriptModels": SCRIPT_MODELS,
        "ttsModels": TTS_MODELS,
        "transcribeModels": TRANSCRIBE_MODELS,
        "retriesPerModel": AI_RETRIES_PER_MODEL,
        "configured": bool(GEMINI_API_KEY),
        "videoExport": "browser-webcodecs",
        "audioMixFallback": "server-ffmpeg",
    }


def _voice_field(voice: object, name: str):
    value = getattr(voice, name, None)
    if value is None:
        return None
    enum_value = getattr(value, "value", None)
    if enum_value is not None:
        return str(enum_value)
    enum_name = getattr(value, "name", None)
    if enum_name is not None and not isinstance(value, str):
        return str(enum_name).lower()
    return str(value)


@app.get("/api/subtitles/presentation/voices")
def list_presentation_voices(
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Falta configurar GEMINI_API_KEY en Render.")

    now = time.monotonic()
    with _voice_catalog_lock:
        cached_voices = list(_voice_catalog_cache.get("voices", []))
        expires_at = float(_voice_catalog_cache.get("expiresAt", 0.0))
        if cached_voices and expires_at > now:
            return {"voices": cached_voices, "cached": True}

    try:
        client = _new_genai_client()

        def fetch_catalog(_: str):
            return client.voices.list(page_size=1000)

        response, _ = _run_ai_with_fallback(
            "voice_catalog",
            x_ai_session_id,
            ["voices-api"],
            fetch_catalog,
        )

        voices: list[dict] = []
        for item in getattr(response, "voices", None) or []:
            voice_id = _voice_field(item, "id")
            if not voice_id:
                continue
            voices.append({
                "id": voice_id,
                "displayName": _voice_field(item, "display_name") or voice_id,
                "gender": (_voice_field(item, "gender") or "neutral").lower(),
                "languageCode": _voice_field(item, "language_code"),
                "accent": _voice_field(item, "accent"),
                "pitch": _voice_field(item, "pitch"),
                "persona": _voice_field(item, "persona"),
                "description": _voice_field(item, "description"),
                "type": (_voice_field(item, "type") or "prebuilt").lower(),
            })

        voices.sort(key=lambda item: (
            0 if item["type"] == "prebuilt" else 1,
            item["displayName"].lower(),
        ))

        with _voice_catalog_lock:
            _voice_catalog_cache["voices"] = voices
            _voice_catalog_cache["expiresAt"] = time.monotonic() + VOICE_CATALOG_TTL_SECONDS

        return {"voices": voices, "cached": False}
    except Exception as exc:
        _log_ai(
            x_ai_session_id,
            "voice_catalog",
            "error",
            "No se pudo cargar el catálogo de voces.",
            error=exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo cargar el catálogo de voces de Gemini: {exc}",
        ) from exc


def _script_owner(session_id: str | None, authorization: str | None) -> tuple[str, str]:
    session = session_user(authorization)
    return (session["user"] if session else "local", _session_id(session_id))


def _script_status(job_id: str, owner: tuple[str, str]) -> dict:
    with _script_lock:
        current = _script_jobs.get(job_id)
        if not current or current["owner"] != owner:
            raise HTTPException(404, "No se encontró este guion. Puedes reintentar desde tu borrador.")
        if current["status"] not in ("ready", "error", "cancelled") and time.monotonic() >= current["deadline"]:
            current.update(status="error", error=f"Se agotó el tiempo en {current['message'].rstrip('…').lower()}.")
        return {key: current[key] for key in ("id", "status", "message", "result", "error")}


def _write_script_status(job: dict, **changes) -> None:
    with _script_lock:
        if job["status"] not in ("ready", "error", "cancelled"):
            job.update(changes)


def _check_script_time(job: dict) -> None:
    with _script_lock:
        if job["status"] == "cancelled":
            raise RuntimeError("Cancelado")
        if time.monotonic() >= job["deadline"]:
            raise TimeoutError("Se agotó el tiempo de generación del guion.")


def _build_presentation_script(job: dict, work_dir: Path, input_path: Path, form: dict, phrases: list[str]) -> None:
    x_ai_session_id = job["owner"][1]
    presentation_type = form["presentation_type"]
    product, highlights, audience, cta, language, collection_items = (
        form[key] for key in ("product", "highlights", "audience", "cta", "language", "collection_items")
    )
    client = None
    remote_file = None

    try:
        _check_script_time(job)
        _write_script_status(job, status="preparing", message="Preparando el video…")
        duration = float(_probe(input_path, timeout=15).get("duration") or 0)
        if not 0 < duration <= 1800:
            raise ValueError("El video necesita una duración válida de hasta 30 minutos.")
        target_seconds = max(1.0, duration - min(1.0, duration * 0.06))
        max_words = max(2, round(target_seconds * 2.35))
        mode_instructions = ""
        if presentation_type == "collection":
            mode_instructions = (
                "Act as a collection presenter. Identify each distinct design in first appearance order, "
                "including quick consecutive cuts. For each design, write one short selling line inside "
                "the visible window; name or characterize that design before the next appears. Combine "
                "the hook with the first design if it is already visible. Keep any CTA within the last "
                "shot. Use supplied names to identify designs, never invent a visible scene. List supplied "
                "designs that cannot be matched confidently in visualNotes. Read legible text printed on the design "
                "or shown with it; put the exact readable phrase in visibleText and use its meaning to write a selling line. "
                "Spoken copy should complement on-screen words, without reading them verbatim unless that quote is the hook. "
                "Leave visibleText null if uncertain and do not guess unreadable words. Never group several designs "
                "into a spoken list over a single design."
            )
        if phrases:
            mode_instructions += (
                " This is alignment only. Return one segment per exact user phrase in input order. "
                "Copy the text verbatim, choose a visual moment for it, and put ambiguous matches in visualNotes. "
                "Do not write extra hooks or CTAs, edit, omit, translate, or reorder the phrases."
            )

        _write_script_status(job, status="analyzing", message="Enviando el video a Gemini…")
        _log_ai(x_ai_session_id, "presentation_script", "info", "Enviando el video a Gemini.")
        client = _new_genai_client(timeout_ms=40_000)
        _check_script_time(job)
        remote_file = client.files.upload(file=str(input_path))
        _write_script_status(job, message="Analizando el video…")
        while getattr(getattr(remote_file, "state", None), "name", None) not in (None, "ACTIVE"):
            _check_script_time(job)
            if getattr(remote_file.state, "name", None) == "FAILED":
                raise RuntimeError("Gemini no pudo procesar este video.")
            time.sleep(1.5)
            remote_file = client.files.get(name=remote_file.name)

        prompt = f"""
You are the creative director and UGC product-script writer for a short social-media video.

Analyze the supplied video visually. Write spoken copy that PRESENTS what is on screen like a real creator or influencer showing a product. Do not narrate obvious camera actions shot-by-shot and do not say generic filler. The speech should complement the visuals, call attention to useful visible details, and sound natural when spoken.

VIDEO DURATION: {duration:.2f} seconds
TARGET SPOKEN DURATION: at most {target_seconds:.2f} seconds
APPROXIMATE MAX WORDS: {max_words}
PRESENTATION TYPE: {presentation_type}
USER PRODUCT DESCRIPTION: {product or "Infer the product from the video"}
DETAILS TO HIGHLIGHT: {highlights or "Infer only useful, visible or user-supported selling points"}
TARGET AUDIENCE: {audience or "General social-media audience"}
CTA: {cta or "Use a short natural CTA only if it fits"}
VOICE LANGUAGE / LOCALE: {language}
COLLECTION DESIGN NAMES (optional, as supplied by the user): {collection_items or "Infer only from the visible designs"}
USER'S EXACT PHRASES (optional JSON array): {json.dumps(phrases, ensure_ascii=False)}
{mode_instructions}

Rules:
- The field "script" must contain ONLY the exact words that should be spoken.
- Do not put stage directions, labels, brackets, markdown, timestamps, or quotes in "script".
- Never invent product claims that cannot be supported by the video or the user's details.
- Aim to finish the spoken delivery slightly before the video ends.
- Start with a compelling natural hook.
- Prefer creator/UGC language over corporate advertising language.
- Break the concept into segments aligned approximately with meaningful visual moments.
- Segment text must concatenate naturally into the full script.
- For each segment return start and end in seconds within the video duration. Use the actual visible window as a guide to when the phrase can play. Return segments in screen order, without intersecting windows.
- Use label for a short editable title describing the visible design or scene.
- Fit the words for each phrase into its own window (roughly two words per second). Do not count an introduction as a separate segment unless there is an opening shot with time for it.
"""

        def create_script(model: str):
            interaction = client.interactions.create(
                model=model,
                input=[
                    {
                        "type": "video",
                        "uri": remote_file.uri,
                        "mime_type": remote_file.mime_type,
                        "processing": {"type": "static", "fps": 2.0 if presentation_type == "collection" and duration <= 90 else 1.0},
                    },
                    {"type": "text", "text": prompt},
                ],
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": PresentationScriptResult.model_json_schema(),
                },
            )

            result = PresentationScriptResult.model_validate_json(interaction.output_text)
            if phrases and (
                len(result.segments) != len(phrases)
                or any(" ".join(segment.text.split()) != " ".join(text.split())
                       for segment, text in zip(result.segments, phrases))
            ):
                raise ValueError("Gemini cambió el texto o el orden del guion escrito.")
            if not 1 <= len(result.segments) <= 60 or any(
                segment.end <= segment.start or segment.start >= duration
                for segment in result.segments
            ):
                raise ValueError("Gemini no devolvió tiempos utilizables para todas las frases.")
            for index, segment in enumerate(result.segments):
                segment.end = min(duration, segment.end)
                if phrases:
                    segment.text = phrases[index]
            result.script = " ".join(segment.text for segment in result.segments)
            return result.model_dump()

        _write_script_status(job, status="writing", message="Ubicando las frases del guion…" if phrases else "Escribiendo el guion…")
        for index, model in enumerate(SCRIPT_MODELS[:2]):
            _check_script_time(job)
            _log_ai(x_ai_session_id, "presentation_script", "info", "Iniciando solicitud.", model=model, attempt=index + 1)
            try:
                result = create_script(model)
                _check_script_time(job)
            except Exception as exc:
                if index == 0 and len(SCRIPT_MODELS) > 1 and (_retryable_ai_error(exc) or isinstance(exc, ValueError)):
                    _log_ai(x_ai_session_id, "presentation_script", "warning", "Probando un modelo alternativo.", model=model, error=exc)
                    _write_script_status(job, message="Probando un modelo alternativo…")
                    continue
                raise
            _log_ai(x_ai_session_id, "presentation_script", "success", "Guion listo.", model=model)
            result["_aiModel"] = model
            _write_script_status(job, status="ready", message="Guion listo", result=result)
            return
        raise RuntimeError("No hay un modelo de guion configurado.")
    except Exception as exc:
        if job["status"] != "cancelled":
            _log_ai(x_ai_session_id, "presentation_script", "error", "El guion no se completó.", error=exc)
            _write_script_status(job, status="error", error=f"{job['message']} {exc}")
    finally:
        _delete_remote_file(client, remote_file)
        shutil.rmtree(work_dir, ignore_errors=True)
        with _script_lock:
            job["finished_at"] = time.monotonic()


@app.post("/api/subtitles/presentation/script")
@app.post("/api/subtitles/presentation/script-jobs", status_code=202)
async def generate_presentation_script(
    request: Request,
    video: UploadFile = File(...),
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
    authorization: str | None = Header(default=None),
    presentation_type: str = Form(default="influencer"),
    product: str = Form(default=""),
    highlights: str = Form(default=""),
    audience: str = Form(default=""),
    cta: str = Form(default=""),
    language: str = Form(default="es-LATAM"),
    collection_items: str = Form(default="", max_length=4000),
    phrases_json: str = Form(default="[]", max_length=14000),
) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(503, "Falta configurar GEMINI_API_KEY en Render.")
    try:
        phrases = json.loads(phrases_json)
        if not isinstance(phrases, list) or len(phrases) > 60 or any(
            not isinstance(item, str) or not item.strip() for item in phrases
        ):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(422, "El guion debe contener hasta 60 frases válidas.") from exc
    if video.size is not None and video.size > SCRIPT_UPLOAD_LIMIT:
        raise HTTPException(413, "El video supera 250 MB. Exporta una copia más liviana para el análisis.")

    owner = _script_owner(x_ai_session_id, authorization)
    job_id = uuid.uuid4().hex
    now = time.monotonic()
    job = dict(id=job_id, owner=owner, deadline=now + SCRIPT_DEADLINE_SECONDS, finished_at=None,
               status="preparing", message="Preparando el video…", result=None, error=None)
    with _script_lock:
        for key, value in list(_script_jobs.items()):
            finished = value["finished_at"]
            if finished is not None and now - finished > SCRIPT_JOB_RETENTION_SECONDS:
                del _script_jobs[key]
        active = [item for item in _script_jobs.values() if item["finished_at"] is None]
        if len(active) >= SCRIPT_CONCURRENCY or any(item["owner"] == owner for item in active):
            raise HTTPException(429, "Hay un análisis en curso. Espera a que termine antes de reintentar.")
        _script_jobs[job_id] = job

    work_dir = WORK_ROOT / f"script-{job_id}"
    suffix = Path(video.filename or "video.mp4").suffix[:12] or ".mp4"
    input_path = work_dir / f"input{suffix.lower()}"
    try:
        work_dir.mkdir(parents=True, exist_ok=True)
        size = 0
        with input_path.open("wb") as target:
            while chunk := await video.read(1024 * 1024):
                size += len(chunk)
                if size > SCRIPT_UPLOAD_LIMIT:
                    raise HTTPException(413, "El video supera 250 MB.")
                target.write(chunk)
        if not size:
            raise HTTPException(422, "El archivo de video está vacío.")
        form = dict(presentation_type=presentation_type, product=product, highlights=highlights,
                    audience=audience, cta=cta, language=language, collection_items=collection_items)
        _script_executor.submit(_build_presentation_script, job, work_dir, input_path, form, phrases)
    except BaseException:
        shutil.rmtree(work_dir, ignore_errors=True)
        with _script_lock:
            _script_jobs.pop(job_id, None)
        raise
    finally:
        await video.close()

    if request.url.path.endswith("/script-jobs"):
        return _script_status(job_id, owner)
    while True:
        state = _script_status(job_id, owner)
        if state["status"] == "ready":
            return state["result"]
        if state["status"] in ("error", "cancelled"):
            raise HTTPException(504, state["error"] or "La preparación fue cancelada.")
        await asyncio.sleep(1)


@app.get("/api/subtitles/presentation/script-jobs/{job_id}")
def get_presentation_script_job(
    job_id: str,
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
    authorization: str | None = Header(default=None),
) -> dict:
    return _script_status(job_id, _script_owner(x_ai_session_id, authorization))


@app.delete("/api/subtitles/presentation/script-jobs/{job_id}")
def cancel_presentation_script_job(
    job_id: str,
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
    authorization: str | None = Header(default=None),
) -> dict:
    owner = _script_owner(x_ai_session_id, authorization)
    _script_status(job_id, owner)
    with _script_lock:
        job = _script_jobs.get(job_id)
        if job and job["owner"] == owner and job["status"] not in ("ready", "error", "cancelled"):
            job.update(status="cancelled", message="Análisis cancelado.")
    return _script_status(job_id, owner)


@app.post("/api/subtitles/presentation/mix-audio")
async def mix_presentation_audio(
    original_audio: UploadFile = File(...),
    generated_voice: UploadFile = File(...),
    duration: float = Form(...),
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
) -> Response:
    if duration <= 0 or duration > 1800:
        raise HTTPException(status_code=400, detail="Duración de mezcla inválida.")

    work_dir = WORK_ROOT / f"mix-{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)
    original_suffix = Path(original_audio.filename or "original.m4a").suffix or ".m4a"
    voice_suffix = Path(generated_voice.filename or "voice.wav").suffix or ".wav"
    original_path = work_dir / f"original{original_suffix.lower()}"
    voice_path = work_dir / f"voice{voice_suffix.lower()}"
    output_path = work_dir / "mixed.wav"

    started = time.monotonic()
    try:
        with original_path.open("wb") as target:
            while chunk := await original_audio.read(1024 * 1024):
                target.write(chunk)
        with voice_path.open("wb") as target:
            while chunk := await generated_voice.read(1024 * 1024):
                target.write(chunk)

        await original_audio.close()
        await generated_voice.close()

        if original_path.stat().st_size <= 0 or voice_path.stat().st_size <= 0:
            raise RuntimeError("Una de las pistas de audio está vacía.")

        _run([
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(original_path),
            "-i",
            str(voice_path),
            "-filter_complex",
            (
                "[0:a][1:a]"
                "amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,"
                "alimiter=limit=0.95[a]"
            ),
            "-map",
            "[a]",
            "-t",
            f"{duration:.3f}",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ])

        if not output_path.exists() or output_path.stat().st_size <= 44:
            raise RuntimeError("FFmpeg no generó una mezcla de audio válida.")

        elapsed = int((time.monotonic() - started) * 1000)
        _log_ai(
            x_ai_session_id,
            "audio_mix_fallback",
            "success",
            "Mezcla de audio fallback completada con FFmpeg.",
            duration_ms=elapsed,
        )

        return Response(
            content=output_path.read_bytes(),
            media_type="audio/wav",
            headers={"X-Audio-Mix": "ffmpeg-fallback"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        elapsed = int((time.monotonic() - started) * 1000)
        _log_ai(
            x_ai_session_id,
            "audio_mix_fallback",
            "error",
            "Falló la mezcla de audio fallback con FFmpeg.",
            error=exc,
            duration_ms=elapsed,
        )
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo mezclar el audio en el servidor: {exc}",
        ) from exc
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/subtitles/presentation/tts")
def generate_presentation_voice(
    request: TTSRequest,
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
) -> Response:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Falta configurar GEMINI_API_KEY en Render.")

    style = TTS_STYLES.get(request.styleId, TTS_STYLES["influencer"])
    locale_style = LANGUAGE_STYLES.get(
        request.language,
        f"Speak naturally in the language and regional variety indicated by {request.language}.",
    )

    try:
        client = _new_genai_client(timeout_ms=30_000)
        def synthesize(model: str):
            return client.interactions.create(
                model=model,
                input=[{
                    "type": "user_input",
                    "content": [{
                        "type": "text",
                        "text": request.script.strip(),
                        "annotations": [{
                            "type": "speech_metadata",
                            "style": f"{style} {locale_style}",
                        }],
                    }],
                }],
                response_format={"type": "audio"},
                generation_config={
                    "speech_config": [
                        {"voice": request.voice},
                    ],
                },
            )

        interaction, used_model = _run_ai_with_fallback(
            "presentation_tts",
            x_ai_session_id,
            TTS_MODELS[:2],
            synthesize,
            max_retries=0,
        )

        output_audio = getattr(interaction, "output_audio", None)
        encoded = getattr(output_audio, "data", None)
        if not encoded:
            raise RuntimeError("Gemini no devolvió audio.")

        if isinstance(encoded, str):
            audio_bytes = base64.b64decode(encoded)
        else:
            audio_bytes = base64.b64decode(bytes(encoded))

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-AI-Model": used_model,
            },
        )
    except Exception as exc:
        _log_ai(
            x_ai_session_id,
            "presentation_tts",
            "error",
            "El pipeline TTS terminó con error.",
            error=exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo generar la voz con Gemini: {exc}",
        ) from exc


@app.post("/api/subtitles/jobs")
async def create_job(
    video: UploadFile = File(...),
    language: str | None = Form(default=None),
    x_ai_session_id: str | None = Header(default=None, alias="X-AI-Session-ID"),
) -> dict:
    job_id = uuid.uuid4().hex
    job_dir = WORK_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename or "media.mp4").suffix or ".mp4"
    input_path = job_dir / f"input{suffix.lower()}"

    with input_path.open("wb") as target:
        while chunk := await video.read(1024 * 1024):
            target.write(chunk)
    await video.close()

    try:
        metadata = _probe(input_path)
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if metadata.get("duration") and metadata["duration"] > 30 * 60:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="Gemini permite hasta 30 minutos cuando usamos timestamps por palabra.",
        )

    job = {
        "id": job_id,
        "status": "queued",
        "progress": 0.0,
        "message": "Archivo recibido. Preparando audio…",
        "fileName": video.filename or input_path.name,
        "requestedLanguage": language or None,
        "language": language or None,
        "aiSessionId": _session_id(x_ai_session_id),
        "inputPath": str(input_path),
        "words": [],
        "captions": [],
        "error": None,
        **metadata,
    }

    with _jobs_lock:
        _jobs[job_id] = job

    _executor.submit(_transcribe, job_id)
    return _public_job(job)


@app.get("/api/subtitles/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(
                status_code=404,
                detail="Trabajo de subtítulos no encontrado.",
            )
        return _public_job(dict(job))
