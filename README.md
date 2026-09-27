# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Subtitle Studio

GAS3D incluye una herramienta aislada para añadir subtítulos sincronizados palabra a palabra a videos. Se abre desde el selector superior **Subtítulos** o directamente en `#/subtitles`.

La transcripción usa **Gemini 3.5 Transcribe** con timestamps por palabra. Render recibe temporalmente el video, FFmpeg extrae una pista FLAC, Gemini devuelve las palabras con tiempos y el backend elimina el archivo temporal al terminar.

La exportación final **no ocurre en Render**. El navegador procesa el video localmente mediante **Mediabunny + WebCodecs**, solicita H.264 con aceleración por hardware y compone los subtítulos animados con Canvas. No existe fallback a FFmpeg/Render.

Presets visuales actuales:

- **Viral Pop**: rebote y palabra activa amarilla.
- **Clean**: minimalista para aprendizaje.
- **Punch**: caja activa y golpe visual.
- **Neon Glow**: brillo dinámico.
- **Karaoke Focus**: contexto atenuado y subrayado progresivo.
- **Cinema**: estilo editorial.
- **Bubble**: cápsula elástica sobre la palabra activa.
- **Focus Box**: bloque oscuro con foco de lectura.

La transcripción se presenta como párrafos. Las palabras parecen texto normal y solo pasan a modo edición al tocarlas.

### Flujo

1. Seleccionar video.
2. Elegir o cambiar idioma.
3. El botón principal muestra **Generar subtítulos**.
4. Gemini devuelve palabras + timestamps.
5. El mismo botón principal cambia a **Exportar MP4**.
6. El navegador renderiza localmente con WebCodecs.

Si se cambia el idioma después de generar, el botón vuelve a **Generar subtítulos** porque la transcripción anterior ya no corresponde al idioma seleccionado.

### Persistencia

- Transcripción, correcciones y estilo: `localStorage`.
- Video original: IndexedDB cuando el navegador lo permite.
- Al reabrir el navegador se intenta reconstruir el proyecto.

### Desarrollo local

Requisitos del backend:

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

El frontend Vite sigue siendo un Static Site. El backend `gas3d-subtitle-api` solo se ocupa de transcribir.

Variables del Web Service:

- `GEMINI_API_KEY`
- `SUBTITLE_CORS_ORIGINS=https://tu-gas3d.onrender.com`
- `GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe`

Variable del Static Site:

- `VITE_SUBTITLE_API_URL=https://gas3d-subtitle-api.onrender.com`

## Build

```bash
npm run build
```

## Modelos

Coloca modelos licenciados en `public/assets/models/garments/` y regístralos en `src/config/garmentModels.ts`.

## Arquitectura

`GarmentViewer` es el visor 3D reutilizable. `GarmentAdStudio` compone el editor 3D.

`SubtitleStudio` usa `services/subtitle_engine` solamente para la transcripción. `localExporter.ts` hace la composición y exportación final en el dispositivo del usuario.

## Limitaciones observadas

La exportación del editor 3D sigue usando `MediaRecorder`.

Subtitle Studio requiere un navegador moderno con WebCodecs y capacidad de decodificar el codec de entrada y codificar H.264/AVC para el MP4 final. Al no existir fallback, un dispositivo sin soporte mostrará un error claro en lugar de enviar el video a Render.

Gemini 3.5 Transcribe limita a 30 minutos los archivos cuando se solicitan timestamps por palabra.
