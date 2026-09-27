from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai

APP_NAME = "GAS3D Subtitle Engine"
GEMINI_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-transcribe")
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
            message="Extrayendo audio del video…",
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
        if remote_file is not None and client is not None:
            try:
                client.files.delete(name=remote_file.name)
            except Exception:
                pass

        # The browser performs the final video render locally. Render only needs
        # the source video long enough to extract/transcribe its audio.
        shutil.rmtree(job_dir, ignore_errors=True)


@app.get("/api/subtitles/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "gemini",
        "model": GEMINI_MODEL,
        "configured": bool(GEMINI_API_KEY),
        "videoExport": "browser-webcodecs",
    }


@app.post("/api/subtitles/jobs")
async def create_job(
    video: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> dict:
    job_id = uuid.uuid4().hex
    job_dir = WORK_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
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
        "message": "Video recibido. Preparando audio…",
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
