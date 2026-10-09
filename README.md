# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Subtitle Studio

GAS3D incluye una herramienta aislada para crear videos con subtítulos y, cuando corresponde, una presentación completa con voz generada por IA.

### Dos flujos explícitos

Al cargar un archivo se elige:

- **Subir video con voz**: Gemini 3.5 Transcribe genera timestamps por palabra y el usuario corrige el texto inline.
- **Subir video sin voz**: Gemini analiza visualmente el video, propone un guion, Gemini TTS genera la voz y ese audio se vuelve a transcribir para sincronizar los subtítulos reales.

En el modo sin voz, la voz generada se mezcla con el audio original del archivo. Así se conservan efectos de sonido, logos animados y otros sonidos existentes.

### Pipeline creativo

1. Gemini analiza el video.
2. Propone un guion adaptado a duración, producto, público, CTA y estilo.
3. El usuario puede editar el guion.
4. Gemini 3.8 TTS genera la voz.
5. Gemini 3.5 Transcribe obtiene timestamps reales de esa locución.
6. Mediabunny + WebCodecs renderizan localmente el MP4 con voz y subtítulos animados.

La exportación final **no ocurre en Render**. El teléfono o PC usa WebCodecs y Canvas, conserva la resolución original y recodifica el video con una calidad alta basada en el bitrate del archivo de entrada.

### Catálogo de voces Gemini

La selección de voz se carga dinámicamente desde la Gemini Voices API en lugar de mantener una lista fija. El catálogo se conserva 24 horas en el navegador y también 24 horas en el backend, por lo que reabrir la app durante el día no vuelve a consultar Gemini.

La interfaz muestra:
- nombre de la voz;
- género percibido: femenina, masculina o neutra;
- idioma/acento/persona cuando están disponibles;
- filtros rápidos por género.

Cambiar únicamente la voz invalida la locución y los timestamps, pero no regenera el guion.

### Resiliencia de IA

Las operaciones temporales se reintentan automáticamente ante 408/429/5xx, timeout, saturación o indisponibilidad.

Para análisis/guion:

```text
gemini-3.8-flash
→ gemini-3.7-flash
→ gemini-3.6-flash
→ gemini-3.5-flash
```

Para TTS:

```text
gemini-3.8-flash-tts
→ gemini-3.8-flash-lite-tts
```

No existen equivalentes TTS 3.7/3.6/3.5, por eso no se simula una degradación incompatible.

Gemini 3.5 Transcribe se reintenta sobre el modelo especializado porque es el que entrega los timestamps por palabra que necesita Subtitle Studio.

Por defecto hay 1 intento inicial + 3 reintentos por modelo, con esperas configurables.

### Logs IA

La interfaz incluye **Logs IA** en móvil y escritorio.

Registra:

- operación;
- modelo;
- número de intento;
- tiempo;
- degradación de modelo;
- error completo;
- eventos del frontend.

El panel permite **Copiar todo** para compartir el diagnóstico. No registra la API key.

### Subtítulos y estilos

La transcripción se presenta como párrafos. Las palabras parecen texto normal y solo pasan a edición al tocarlas.

En el preview, los subtítulos se manipulan directamente: un dedo los mueve verticalmente y un gesto de pellizco cambia su tamaño. No se aplica rotación. La posición y escala se conservan en el proyecto y se reproducen en la exportación.

Los colores se separan en texto, palabra activa, contorno y efecto. El color de efecto controla elementos como glow Neon, caja Punch, cápsula Bubble, subrayado Karaoke y fondo Focus.

Presets actuales:

- Viral Pop
- Clean
- Punch
- Neon Glow
- Karaoke Focus
- Cinema
- Bubble
- Focus Box

Preview y exportación usan las mismas fuentes web para evitar diferencias tipográficas entre dispositivos.

### Layout móvil fijo

El editor móvil ocupa exactamente el viewport disponible:
- header/acción principal fijo arriba;
- video ocupa todo el espacio restante;
- timeline con altura fija;
- dock de herramientas con altura fija abajo;
- los mensajes de progreso/error flotan y no alteran el layout;
- no hay scroll de página durante la edición;
- los paneles largos se desplazan dentro del dock y el teclado puede reducir temporalmente el viewport.

### Fallback de mezcla AAC en Android

La exportación sigue siendo local. Si Android no permite decodificar programáticamente el AAC original, GAS3D extrae solo la pista de audio del MP4 (sin subir el video), envía esa pista junto con la voz Gemini al backend y FFmpeg devuelve una mezcla WAV. La codificación del video continúa localmente.

### Futuro: edición de voz por bloques

Pendiente para una fase posterior: dividir la locución de Gemini en bloques independientes sobre una pista de audio, permitiendo mover cada bloque temporalmente para ajustar con precisión cuándo comienza y termina respecto del video.

### Persistencia


- Proyecto, guion, transcripción, correcciones y estilo: `localStorage`.
- Video original y voz generada: IndexedDB cuando el navegador lo permite.
- Al reabrir el navegador se intenta reconstruir el proyecto.

### Desarrollo local

Requisitos:

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

Backend:

- `GEMINI_API_KEY`
- `SUBTITLE_CORS_ORIGINS=https://tu-gas3d.onrender.com`
- `GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe`
- `GEMINI_SCRIPT_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash`
- `GEMINI_TTS_MODELS=gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts`
- `AI_RETRIES_PER_MODEL=3`
- `AI_RETRY_DELAYS=1.5,3,6`
- `VOICE_CATALOG_TTL_SECONDS=86400`

Frontend:

- `VITE_SUBTITLE_API_URL=https://gas3d-subtitle-api.onrender.com`

## Build

```bash
npm run build
```

## Modelos 3D

Coloca modelos licenciados en `public/assets/models/garments/` y regístralos en `src/config/garmentModels.ts`.

## Limitaciones

Subtitle Studio requiere un navegador moderno con WebCodecs para la exportación local. No existe fallback de renderizado de video en Render.
