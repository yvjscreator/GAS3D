# GAS3D Subtitle Engine

Backend FastAPI de transcripción para Subtitle Studio.

## Flujo

1. Recibe temporalmente el video.
2. FFmpeg extrae audio FLAC mono a 16 kHz.
3. El audio se sube temporalmente a Gemini Files API.
4. `gemini-3.5-transcribe` devuelve anotaciones por palabra con inicio y fin.
5. El archivo remoto de Gemini se elimina.
6. El video y audio temporales de Render se eliminan.

La exportación final del MP4 no se realiza en este servicio. El frontend usa Mediabunny + WebCodecs + Canvas directamente en el dispositivo.

## Desarrollo local

```bash
python -m venv .venv-subtitles
source .venv-subtitles/bin/activate
pip install -r services/subtitle_engine/requirements.txt
export GEMINI_API_KEY="..."
python -m uvicorn subtitle_engine.app:app --app-dir services --host 127.0.0.1 --port 8787
```

Variables:

- `GEMINI_API_KEY` obligatoria.
- `GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe`.
- `SUBTITLE_CORS_ORIGINS=http://localhost:5173` o la URL del frontend.
- `TRANSCRIBE_WORKERS=2`.

## Render

El servicio solo necesita FFmpeg para extraer audio; no codifica el video final.

`/api/subtitles/health` informa además `"videoExport": "browser-webcodecs"`.

No guardes `GEMINI_API_KEY` en Git.
