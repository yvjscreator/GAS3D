# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Subtitle Studio

GAS3D incluye una herramienta aislada para añadir subtítulos sincronizados palabra a palabra a videos. Se abre desde el selector superior **Subtítulos** o directamente en `#/subtitles`.

La transcripción usa **Gemini 3.5 Transcribe** con timestamps por palabra. El backend extrae una pista FLAC temporal mediante FFmpeg, la envía a Gemini y elimina ese archivo remoto al terminar. La exportación usa FFmpeg + ASS para generar MP4 sin marca de agua y sin escalar la imagen del video original.

Incluye presets visuales:

- **Viral Pop**: alto contraste y pop de palabra activa.
- **Clean**: minimalista para contenido educativo.
- **Punch**: mayúsculas y énfasis fuerte.
- **Neon Glow**: acento luminoso para gaming/tech.
- **Karaoke Focus**: contexto atenuado y palabra activa dominante.
- **Cinema**: estilo editorial más sobrio.

La transcripción puede corregirse palabra por palabra antes de exportar.

### Desarrollo local

Requisitos adicionales:

- Python 3.10+
- FFmpeg / FFprobe en `PATH`
- `GEMINI_API_KEY`

```bash
python -m venv .venv-subtitles
source .venv-subtitles/bin/activate
pip install -r services/subtitle_engine/requirements.txt
export GEMINI_API_KEY="..."
npm run subtitles:api
```

En otra terminal:

```bash
npm run dev
```

### Render

La arquitectura recomendada conserva el frontend Vite ya desplegado y añade un Web Service Python para Subtitle Studio.

El repo incluye `render.yaml` para crear el backend `gas3d-subtitle-api`.

Variables del Web Service:

- `GEMINI_API_KEY`: clave privada de Gemini.
- `SUBTITLE_CORS_ORIGINS`: URL pública del frontend GAS3D, por ejemplo `https://tu-gas3d.onrender.com`.
- `GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe`.

En el Static Site existente configura:

- `VITE_SUBTITLE_API_URL=https://gas3d-subtitle-api.onrender.com`

Después vuelve a desplegar el Static Site para que Vite incorpore la URL del backend.


### Flujo de proyecto y móvil

- Seleccionar un video ya no inicia la transcripción automáticamente.
- El idioma puede elegirse o cambiarse después de cargar el archivo; Gemini solo se llama al pulsar **Generar subtítulos**.
- En móvil se usa un editor compacto inspirado en editores de video: preview superior, transporte/timeline y dock inferior con paneles contextuales de Video, Estilo, Texto y Subtítulos.
- El estado del proyecto (transcripción, correcciones y estilo) se guarda en `localStorage`. El video se guarda de forma best-effort en IndexedDB para poder restaurar el proyecto después de cerrar el navegador.
- La exportación es asíncrona: el API devuelve rápido un ID, FFmpeg renderiza en segundo plano, el frontend consulta el progreso y descarga cuando el MP4 está listo. Esto evita mantener una petición HTTP larga abierta durante todo el render.

## Build

```bash
npm run build
```

## Modelos

Coloca modelos licenciados en `public/assets/models/garments/` y regístralos en `src/config/garmentModels.ts`. Este primer proyecto no recibió un modelo 3D de origen, por lo que incluye una remera procedural local como respaldo funcional.

## Arquitectura

`GarmentViewer` es el visor 3D reutilizable: no depende de la interfaz del estudio y acepta prenda, estampado y animación mediante props. `GarmentAdStudio` compone el editor, controles de medios, preview y exportación.

`SubtitleStudio` es independiente del editor 3D y habla con `services/subtitle_engine` mediante `/api/subtitles`. En desarrollo Vite proxifica esas llamadas al motor local en el puerto `8787`; en producción usa `VITE_SUBTITLE_API_URL`.

## Limitaciones observadas

La exportación del editor 3D usa `MediaRecorder`; en navegadores habituales se genera WebM. La calibración definitiva de zonas de impresión debe hacerse al incorporar el modelo de remera real.

Subtitle Studio requiere FFmpeg con soporte para el filtro `ass`/libass. Gemini 3.5 Transcribe limita a 30 minutos los archivos cuando se solicitan timestamps por palabra.
