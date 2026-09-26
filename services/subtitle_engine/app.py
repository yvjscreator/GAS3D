from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field

APP_NAME = "GAS3D Subtitle Engine"
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3")
DEVICE = os.getenv("WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
WORK_ROOT = Path(os.getenv("SUBTITLE_WORK_DIR", Path(tempfile.gettempdir()) / "gas3d-subtitles"))
WORK_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_model: WhisperModel | None = None
_model_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("WHISPER_WORKERS", "1"))))


class ExportOptions(BaseModel):
    baseColor: str = "#FFFFFF"
    activeColor: str = "#FFE347"
    outlineColor: str = "#000000"
    fontScale: float = Field(default=6.0, ge=2.5, le=14.0)
    position: Literal["top", "center", "bottom"] = "bottom"
    maxWords: int = Field(default=5, ge=1, le=12)
    uppercase: bool = False
    wordOverrides: dict[int, str] = {}


def _get_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"No se encontró {command[0]}. Instalá FFmpeg y asegurate de que esté en PATH.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(detail[-1400:] or f"Falló {command[0]}.") from exc


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
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
        "-of", "json", str(path),
    ])
    payload = json.loads(result.stdout)
    video = next((stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"), {})
    duration = payload.get("format", {}).get("duration")
    return {
        "duration": float(duration) if duration is not None else None,
        "width": int(video["width"]) if video.get("width") else None,
        "height": int(video["height"]) if video.get("height") else None,
        "fps": _parse_rate(video.get("r_frame_rate")),
    }


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
        job = _jobs[job_id]
        input_path = Path(job["inputPath"])
        requested_language = job.get("requestedLanguage")
        duration = job.get("duration") or 0.0

    try:
        _update_job(job_id, status="transcribing", progress=0.03, message=f"Cargando Whisper {MODEL_NAME}…")
        model = _get_model()
        _update_job(job_id, progress=0.08, message="Analizando audio con timestamps por palabra…")

        segments, info = model.transcribe(
            str(input_path),
            language=requested_language or None,
            task="transcribe",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 250},
            condition_on_previous_text=True,
        )

        words: list[dict] = []
        detected_language = getattr(info, "language", None) or requested_language
        audio_duration = float(getattr(info, "duration", 0.0) or duration or 0.0)

        for segment in segments:
            for raw_word in segment.words or []:
                text = (raw_word.word or "").strip()
                if not text:
                    continue
                start = max(0.0, float(raw_word.start or 0.0))
                end = max(start + 0.01, float(raw_word.end or start + 0.01))
                words.append({"id": len(words), "text": text, "start": start, "end": end})
                if audio_duration > 0:
                    progress = min(0.96, 0.08 + (end / audio_duration) * 0.88)
                    _update_job(job_id, progress=progress, message=f"Transcribiendo… {int(progress * 100)}%")

        if not words:
            raise RuntimeError("Whisper no detectó palabras en el audio.")

        _update_job(
            job_id,
            status="ready",
            progress=1.0,
            message=f"Transcripción lista · {len(words)} palabras",
            language=detected_language,
            words=words,
            captions=_group_words(words),
            error=None,
        )
    except Exception as exc:
        _update_job(job_id, status="error", progress=1.0, message="La transcripción falló.", error=str(exc))


def _hex_to_ass(value: str) -> str:
    cleaned = value.strip().lstrip("#")
    if len(cleaned) != 6:
        cleaned = "FFFFFF"
    red, green, blue = cleaned[0:2], cleaned[2:4], cleaned[4:6]
    return f"&H00{blue}{green}{red}&"


def _escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def _ass_time(seconds: float) -> str:
    centiseconds = max(0, int(round(seconds * 100)))
    hours, remainder = divmod(centiseconds, 360000)
    minutes, remainder = divmod(remainder, 6000)
    whole_seconds, cs = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{cs:02d}"


def _build_ass(job: dict, options: ExportOptions, output_path: Path) -> None:
    width = int(job.get("width") or 1080)
    height = int(job.get("height") or 1920)
    words = [dict(word) for word in job["words"]]

    for word in words:
        replacement = options.wordOverrides.get(word["id"])
        if replacement is not None:
            word["text"] = replacement.strip() or word["text"]
        if options.uppercase:
            word["text"] = word["text"].upper()

    groups = _group_words(words, options.maxWords)
    by_id = {word["id"]: word for word in words}
    font_size = max(18, round(height * options.fontScale / 100))
    outline = max(2, round(height * 0.0026))
    shadow = max(1, round(height * 0.0012))
    margin_v = max(26, round(height * 0.075))
    alignment = {"top": 8, "center": 5, "bottom": 2}[options.position]
    base = _hex_to_ass(options.baseColor)
    active = _hex_to_ass(options.activeColor)
    outline_color = _hex_to_ass(options.outlineColor)

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "ScaledBorderAndShadow: yes",
        "WrapStyle: 2",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,Arial,{font_size},{base},{base},{outline_color},&H78000000,-1,0,0,0,100,100,0,0,1,{outline},{shadow},{alignment},{round(width * 0.06)},{round(width * 0.06)},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    for group in groups:
        group_words = [by_id[word_id] for word_id in group["wordIds"] if word_id in by_id]
        for index, active_word in enumerate(group_words):
            start = active_word["start"]
            next_start = group_words[index + 1]["start"] if index + 1 < len(group_words) else group["end"] + 0.20
            end = max(active_word["end"], next_start)
            rendered: list[str] = []
            for word in group_words:
                text = _escape_ass(word["text"])
                if word["id"] == active_word["id"]:
                    rendered.append(r"{\1c" + active + r"\fscx106\fscy106}" + text + r"{\fscx100\fscy100}")
                else:
                    rendered.append(r"{\1c" + base + "}" + text)
            lines.append(
                f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Default,,0,0,0,,{' '.join(rendered)}"
            )

    output_path.write_text("\n".join(lines), encoding="utf-8")


@app.get("/api/subtitles/health")
def health() -> dict:
    return {
        "ok": True,
        "engine": "faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
    }


@app.post("/api/subtitles/jobs")
async def create_job(video: UploadFile = File(...), language: str | None = Form(default=None)) -> dict:
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
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = {
        "id": job_id,
        "status": "queued",
        "progress": 0.0,
        "message": "Video recibido. Preparando Whisper…",
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
            raise HTTPException(status_code=404, detail="Trabajo de subtítulos no encontrado.")
        return _public_job(dict(job))


@app.post("/api/subtitles/jobs/{job_id}/export")
def export_job(job_id: str, options: ExportOptions) -> FileResponse:
    with _jobs_lock:
        source = _jobs.get(job_id)
        if not source:
            raise HTTPException(status_code=404, detail="Trabajo de subtítulos no encontrado.")
        job = dict(source)

    if job["status"] != "ready":
        raise HTTPException(status_code=409, detail="La transcripción todavía no está lista.")

    job_dir = Path(job["inputPath"]).parent
    ass_path = job_dir / "captions.ass"
    output_path = job_dir / "subtitled.mp4"

    try:
        _build_ass(job, options, ass_path)
        _run([
            "ffmpeg", "-y",
            "-i", job["inputPath"],
            "-map", "0:v:0",
            "-map", "0:a?",
            "-vf", f"ass={ass_path}",
            "-c:v", "libx264",
            "-preset", os.getenv("SUBTITLE_X264_PRESET", "medium"),
            "-crf", os.getenv("SUBTITLE_CRF", "18"),
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(output_path),
        ])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo exportar: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"{Path(job['fileName']).stem}-subtitulado.mp4",
    )
