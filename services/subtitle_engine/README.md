# GAS3D Subtitle Engine

Motor local para Subtitle Studio.

## Requisitos

- Python 3.10+
- FFmpeg y FFprobe disponibles en `PATH`
- GPU NVIDIA opcional. En CPU funciona, pero `large-v3` será más lento.

## Instalar

```bash
python -m venv .venv-subtitles
source .venv-subtitles/bin/activate
pip install -r services/subtitle_engine/requirements.txt
```

## Ejecutar

```bash
python -m uvicorn subtitle_engine.app:app --app-dir services --host 127.0.0.1 --port 8787
```

Por defecto se usa `faster-whisper large-v3`, con `beam_size=5`, VAD y timestamps por palabra.

Variables opcionales:

- `WHISPER_MODEL=large-v3`
- `WHISPER_DEVICE=auto`
- `WHISPER_COMPUTE_TYPE=default`
- `WHISPER_WORKERS=1`
- `SUBTITLE_CRF=18`
- `SUBTITLE_X264_PRESET=medium`

El primer uso descarga el modelo si no está en caché.
