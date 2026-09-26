# GAS3D Subtitle Engine

Backend FastAPI para Subtitle Studio.

## Flujo

1. Recibe el video.
2. FFmpeg extrae audio FLAC mono a 16 kHz.
3. El archivo se sube temporalmente a Gemini Files API.
4. `gemini-3.5-transcribe` produce anotaciones por palabra con inicio y fin.
5. El archivo remoto se elimina.
6. FFmpeg + ASS quema el estilo elegido en el video para exportar MP4.

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
- `SUBTITLE_CORS_ORIGINS=http://localhost:5173` o la URL del frontend en Render.
- `TRANSCRIBE_WORKERS=2`.
- `SUBTITLE_CRF=18`.
- `SUBTITLE_X264_PRESET=veryfast`.

## Render

Render incluye FFmpeg en sus runtimes nativos, por lo que el servicio puede desplegarse como Python Web Service sin Docker.

El `render.yaml` de la raíz contiene una configuración inicial. El servicio debe exponer `/api/subtitles/health` y utilizar el puerto definido por `$PORT`.

No guardes `GEMINI_API_KEY` en Git.
