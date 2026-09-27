from __future__ import annotations

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

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google import genai
from pydantic import BaseModel, Field

APP_NAME = "GAS3D Subtitle Engine"
GEMINI_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-transcribe")
SCRIPT_MODEL = os.getenv("GEMINI_SCRIPT_MODEL", "gemini-3.8-flash")
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("TRANSCRIBE_WORKERS", "2")))
)


class PresentationSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    purpose: str
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


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True)
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


def _probe(path: Path) -> dict:
    result = _run([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height,r_frame_rate",
        "-of",
        "json",
        str(path),
    ])
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
        client = genai.Client(api_key=GEMINI_API_KEY)
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
        interaction = client.interactions.create(
            model=GEMINI_MODEL,
            input=[{
                "type": "audio",
                "uri": remote_file.uri,
                "mime_type": remote_file.mime_type,
            }],
            generation_config={
                "transcription_config": transcription_config,
            },
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
            message=f"Transcripción lista · {len(words)} palabras",
            words=words,
            captions=_group_words(words),
            error=None,
        )
    except Exception as exc:
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


@app.get("/api/subtitles/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "gemini",
        "model": GEMINI_MODEL,
        "scriptModel": SCRIPT_MODEL,
        "ttsModel": TTS_MODEL,
        "configured": bool(GEMINI_API_KEY),
        "videoExport": "browser-webcodecs",
    }


@app.post("/api/subtitles/presentation/script")
async def generate_presentation_script(
    video: UploadFile = File(...),
    presentation_type: str = Form(default="influencer"),
    product: str = Form(default=""),
    highlights: str = Form(default=""),
    audience: str = Form(default=""),
    cta: str = Form(default=""),
    language: str = Form(default="es-LATAM"),
) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Falta configurar GEMINI_API_KEY en Render.")

    work_dir = WORK_ROOT / f"script-{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    input_path = work_dir / f"input{suffix.lower()}"
    client = None
    remote_file = None

    try:
        with input_path.open("wb") as target:
            while chunk := await video.read(1024 * 1024):
                target.write(chunk)
        await video.close()

        metadata = _probe(input_path)
        duration = float(metadata.get("duration") or 0)
        if duration <= 0:
            raise RuntimeError("No se pudo determinar la duración del video.")

        target_seconds = max(3.0, duration - min(1.0, duration * 0.06))
        max_words = max(8, round(target_seconds * 2.35))

        client = genai.Client(api_key=GEMINI_API_KEY)
        remote_file = client.files.upload(file=str(input_path))
        remote_file = _wait_for_gemini_file(client, remote_file)

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

Rules:
- The field "script" must contain ONLY the exact words that should be spoken.
- Do not put stage directions, labels, brackets, markdown, timestamps, or quotes in "script".
- Never invent product claims that cannot be supported by the video or the user's details.
- Aim to finish the spoken delivery slightly before the video ends.
- Start with a compelling natural hook.
- Prefer creator/UGC language over corporate advertising language.
- Break the concept into segments aligned approximately with meaningful visual moments.
- Segment text must concatenate naturally into the full script.
- Keep each segment's start/end within the video duration.
"""

        interaction = client.interactions.create(
            model=SCRIPT_MODEL,
            input=[
                {
                    "type": "video",
                    "uri": remote_file.uri,
                    "mime_type": remote_file.mime_type,
                    "processing": {"type": "static", "fps": 1.0},
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
        return result.model_dump()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo crear el guion con Gemini: {exc}",
        ) from exc
    finally:
        _delete_remote_file(client, remote_file)
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/subtitles/presentation/tts")
def generate_presentation_voice(request: TTSRequest) -> Response:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Falta configurar GEMINI_API_KEY en Render.")

    style = TTS_STYLES.get(request.styleId, TTS_STYLES["influencer"])
    locale_style = LANGUAGE_STYLES.get(
        request.language,
        f"Speak naturally in the language and regional variety indicated by {request.language}.",
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        interaction = client.interactions.create(
            model=TTS_MODEL,
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
            response_format={
                "type": "audio",
                "mime_type": "audio/wav",
            },
            generation_config={
                "speech_config": [
                    {"voice": request.voice},
                ],
            },
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
            headers={"Cache-Control": "no-store"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo generar la voz con Gemini: {exc}",
        ) from exc


@app.post("/api/subtitles/jobs")
async def create_job(
    video: UploadFile = File(...),
    language: str | None = Form(default=None),
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
