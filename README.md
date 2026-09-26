# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Subtitle Studio

GAS3D incluye una herramienta aislada para añadir subtítulos sincronizados palabra a palabra a videos. Se abre desde el selector superior **Subtítulos** o directamente en `#/subtitles`.

El motor usa `faster-whisper` con `large-v3`, timestamps por palabra, VAD y búsqueda con `beam_size=5`. La exportación usa FFmpeg + ASS para resaltar la palabra activa y genera MP4 sin marca de agua manteniendo las dimensiones y el ritmo de cuadros del video de entrada.

Requisitos adicionales:

- Python 3.10+
- FFmpeg / FFprobe en `PATH`

Primera instalación:

```bash
python -m venv .venv-subtitles
source .venv-subtitles/bin/activate
pip install -r services/subtitle_engine/requirements.txt
```

Ejecuta el motor en una terminal:

```bash
npm run subtitles:api
```

Y Vite en otra:

```bash
npm run dev
```

El primer uso puede descargar el modelo `large-v3`. En GPU NVIDIA el procesamiento será mucho más rápido; en CPU sigue siendo funcional, pero la transcripción será más lenta.

## Build

```bash
npm run build
```

## Modelos

Coloca modelos licenciados en `public/assets/models/garments/` y regístralos en `src/config/garmentModels.ts`. Este primer proyecto no recibió un modelo 3D de origen, por lo que incluye una remera procedural local como respaldo funcional.

## Arquitectura

`GarmentViewer` es el visor 3D reutilizable: no depende de la interfaz del estudio y acepta prenda, estampado y animación mediante props. `GarmentAdStudio` compone el editor, controles de medios, preview y exportación.

`SubtitleStudio` es independiente del editor 3D y habla con `services/subtitle_engine` a través de `/api/subtitles`. En desarrollo Vite proxifica esas llamadas al motor local en el puerto `8787`.

## Limitaciones observadas

La exportación del editor 3D usa `MediaRecorder`; en navegadores habituales se genera WebM. La calibración definitiva de zonas de impresión debe hacerse al incorporar el modelo de remera real.

Subtitle Studio requiere FFmpeg con soporte para el filtro `ass`/libass.
