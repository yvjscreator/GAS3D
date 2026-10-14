# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Images Studio

La tercera pestaña de GAS3D (`#/images`) prepara arte creado sobre fondos negros **o blancos** para estampar prendas del color correspondiente. Todo se procesa localmente: sin Gemini ni servidor.

- **Prenda negra:** retira negro, casi negro y sombras de todo el dibujo.
- **Prenda blanca:** retira blanco, casi blanco e iluminaciones de todo el dibujo.
- Presets (puro, negros/sombras o blancos/luces, agresivo) y cinco controles para ajuste fino.
- Preview sobre alfa, negro, blanco y remera del color elegido; antes/después.
- **Comparar rápidamente:** pulsa dos veces `Ctrl` (en menos de 370 ms) y mantén presionada la segunda pulsación para ver la imagen original; al soltar vuelve al resultado. El botón de antes/después sigue disponible.
- **Modo Zen:** aprovecha el viewport, panel de ajustes plegable y estado recordado.

### Individual y por lotes

- **Individual:** sube una imagen PNG/JPG/WebP, ajusta y exporta un PNG transparente.
- **Por lotes:** agrega hasta 40 archivos en una **barra lateral izquierda**, como capas de Photoshop, con miniaturas, selección, estados y eliminación individual. En móvil la barra se abre como un panel deslizable sin reducir el lienzo. Comparte color de prenda, preset y ajustes entre todos.
- **Exportar ZIP:** procesa las imágenes una por una para limitar el consumo de memoria, con porcentaje y estado por archivo; si falla alguna, continúa con las demás y entrega las exitosas en el ZIP.
- Los PNG conservan la resolución y las proporciones originales. El ZIP utiliza almacenamiento sin recomprimir los PNG (ya comprimidos), sin dependencias externas.
- Los nombres terminan en `-black-tee-ready.png` o `-white-tee-ready.png`; los duplicados se renombran dentro del ZIP.

### Lienzos de exportación para estampado

**Images → Lienzo de impresión** ofrece estos formatos (sin IA ni recorte):

| Formato | PNG final | Resolución física |
| --- | --- | --- |
| Original | Píxeles de entrada | Sin densidad de impresión impuesta |
| 40 × 53 cm | **4724 × 6260 px** | **300 ppp**, escritos en el PNG mediante `pHYs` |
| 35 × 40 cm | **4134 × 4724 px** | **300 ppp**, escritos en el PNG mediante `pHYs` |
| Companion ×2 | Ancho ×2 y alto ×2 | Sin dimensión física forzada |

Por defecto se usa **Auto**. La sugerencia por relación de aspecto distingue 40:53, 35:40 y los companion icons aproximadamente cuadrados de unos 2000 px; ante imágenes poco reconocibles conserva el tamaño original. Puedes elegir otro preset manualmente en cualquier momento. En lotes, Auto evalúa **cada archivo** individualmente; un preset manual aplica el mismo tamaño de salida a todos.

La imagen ya procesada se coloca en el centro de un **lienzo transparente** con ajuste *contain* (encajar completa); nunca se estira de forma desproporcionada ni se recortan los cuatro extremos. La opción **Permitir ampliar para encajar** controla si los formatos de impresión pueden escalar imágenes pequeñas; Companion siempre escala exactamente ×2. Ampliar ráster no crea detalle real. Mantener los 300 ppp requiere tanto los píxeles suficientes como la metadata `pHYs`, que se inserta después de codificar el PNG sin recompresión del arte.

La nueva resolución se aplica por igual a **Exportar PNG** y al contenido de **Exportar ZIP**, sin modificar el preview ni los archivos originales. Los nombres distinguen el formato de salida (por ejemplo `-40x53-300ppp-black-tee-ready.png`).

### Print Production Pipeline — sRGB y semitransparencias DTG/DTF

La sección **03 / Método de impresión** elige el tratamiento de alfa, aplicado **después de** encajar el arte procesado en el lienzo final, para no redimensionar luego el tramado:

- **DTG (predeterminado):** conserva los 256 niveles originales de alfa.
- **DTF · Tramado inteligente:** aproximación de degradados mediante puntos agrupados de 8 píxeles en la resolución final; la salida tiene alfa estrictamente 0/255. El umbral de limpieza descarta zonas con cobertura muy tenue. Inspeccionar y probar el tamaño mínimo de puntos con el taller.
- **DTF · Alfa sólido:** umbral del 50% con alfa 0/255; recomendado para logos y elementos planos.
- **DTF · Conservar alfa:** deja las semitransparencias existentes para flujos RIP compatibles.

La vista previa procesada incluye una aproximación del DTF. El tamaño real de los puntos se calcula sobre los píxeles del PNG **después** del ajuste 40×53, 35×40 o Companion ×2. En Companion, como el tamaño se define en píxeles y no en centímetros, es necesario confirmar con el taller la escala de impresión para interpretar físicamente los puntos.

La sección **04 / Gestión de color** aplica el camino de dibujo sRGB del navegador (decodificación con gestión ICC cuando el navegador admite el perfil → Canvas2D sRGB). Permite **incrustar un perfil ICC sRGB real** como chunk \`iCCP\` comprimido, activado por defecto. Esto es distinto de limitarse a etiquetar un archivo arbitrario como sRGB. El PNG se verifica como **RGBA de 8 bits por canal**, y se valida que la incrustación ICC y los **300 ppp** solicitados estén presentes. La conversión de perfiles de entrada no reconocidos depende del soporte del navegador; no se garantiza una equivalencia exacta con el motor ICC de Photoshop para todos los perfiles.

Las opciones se aplican tanto a **Exportar PNG** como a cada archivo del **ZIP por lotes**, preservando la relación de aspecto, los márgenes transparentes y el ajuste centrado del lienzo. Los cambios de impresión/color invalidan la indicación de estado de un lote anterior. Los PNG pueden ser voluminosos por sus dimensiones aunque sean de 8 bits.

QA técnico: ejecutar \`npm run qa:images\` para comprobar geometría, salida alfa binaria, integridad real del perfil ICC sRGB descomprimido, profundidad de 8 bits RGBA y densidad 300 ppp. Ejecutar además \`npm run build\` antes del deploy. Las pruebas de RIP y de impresión física son necesarias para calibrar el tramado y no se sustituyen por este QA.

### Inspección del preview

- Rueda del mouse sobre la imagen: zoom **centrado en el punto del cursor**, desde 100% (ajustado) hasta 1000%.
- Con zoom mayor a 100%, arrastra el lienzo con el botón izquierdo.
- El botón **Ajustar** restablece el encuadre; también se reinicia al cambiar de imagen.
- Al acercar, se reconstruye **solo la región visible desde los píxeles de la imagen original**: en una imagen 4K el zoom no se limita al preview reducido de 1300 px (850 px en móvil).
- El detalle de alta resolución aparece automáticamente tras una pausa breve de la rueda o del arrastre; mientras tanto se mantiene una previsualización fluida.
- El resultado depende de la nitidez real del archivo: ampliar más allá de sus píxeles nativos no inventa detalles.
- Zoom y pan afectan solamente la vista previa, nunca la resolución ni la imagen exportada.

Límites preventivos: 60 MB por archivo, 18 MP en móviles y 30 MP en escritorio; máximo de 40 imágenes por lote. Los ZIP estándar no admiten más de 4 GB. Una carpeta con muchas imágenes de alta resolución puede consumir mucha memoria.

Nota: este proceso elimina los colores globalmente, tal como `Gama de colores` en Photoshop; también desaparecen detalles interiores de ese color. Verifica el PNG en el RIP/proveedor antes de producir.

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
