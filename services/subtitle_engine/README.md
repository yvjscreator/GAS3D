# GAS3D Subtitle Engine

Backend FastAPI de transcripción para Subtitle Studio.

También aloja el catálogo personal de Mockup Studio en `/api/mockups`, con originales y configuración en Cloudinary. Configuración, aislamiento respecto de SolutionSuite y pruebas: [mockup-cloud-library.md](../../agents/mockup-cloud-library.md).

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

- `GEMINI_API_KEY`: respaldo del servidor cuando el navegador no tiene una clave personal. La clave personal se guarda en IndexedDB por cuenta de GAS3D y se envía al backend autenticado solo para operaciones con Gemini. El backend la usa en memoria durante esa operación.
- `GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe`.
- `SUBTITLE_CORS_ORIGINS=http://localhost:5173` o la URL del frontend.
- `TRANSCRIBE_WORKERS=2`.

## Render

El servicio solo necesita FFmpeg para extraer audio; no codifica el video final.

`/api/subtitles/health` informa además `"videoExport": "browser-webcodecs"`.

`/api/subtitles/health` también indica los modelos que la API tiene configurados. El guion prueba la lista por orden, una vez por modelo, dentro del plazo del trabajo. La voz usa la primera toma completa válida. `gemini-3.1-flash-tts-preview` es un respaldo temporal para voces compatibles; Google anuncia su retiro para el 18 de diciembre de 2026. Transcribe mantiene el modelo por lotes con tiempos por palabra y reintenta los fallos temporales.

No guardes `GEMINI_API_KEY` en Git.
