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
- **Otro color:** usa el cuentagotas para tocar el fondo de la imagen original, con mouse o desde el teléfono. También admite selector y código HEX. Se conserva el color elegido al volver a abrir el módulo.
- Mientras el cuentagotas está activo se muestra el original; Esc o el mismo botón cancela sin cambiar el color. La muestra usa coordenadas de resolución original incluso con zoom. Las zonas transparentes no se pueden muestrear.
- En Otro color, **Color exacto / Equilibrado / Ampliado**, **Tolerancia de color** y **Tonos cercanos** controlan qué variantes se eliminan. Se retira ese color también dentro del dibujo; no es una selección por objeto. La limpieza de bordes compensa el fondo seleccionado. Negro y blanco mantienen su comportamiento anterior.
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
- Otro color exporta `-custom-color-ready.png` y usa el mismo color y tratamiento para cada archivo del ZIP, incluyendo PNG grandes procesados por franjas. La vista **Color** permite comprobarlo sobre el tono elegido; Alfa, Negro y Blanco siguen disponibles.

### Resolución de exportación

**02 / Exportación** conserva los píxeles originales y recorta únicamente los márgenes transparentes exteriores. Los presets 40 × 53 y 35 × 40 agregan metadatos de **300 ppp**, sin redimensionar el arte. Original y Companion conservan las dimensiones sin imponer densidad. Los nombres históricos de presets siguen siendo compatibles; no garantizan por sí solos esas medidas físicas.

**Auto** sugiere un preset por proporción y dimensiones, individualmente para cada archivo del lote. Exportar PNG y ZIP comparten el tratamiento a resolución nativa, los límites de memoria y la exportación por franjas para PNG grandes. Nunca se reduce silenciosamente la resolución del archivo final.

### Transparencias DTG/DTF

La sección **03 / Método de impresión** aplica el acabado después de limpiar el color de fondo, siempre sobre los píxeles originales antes de recortar márgenes:

- **DTG (predeterminado):** conserva los degradados y semitransparencias del arte limpio.
- **DTF · Protegido:** trama las transparencias y refuerza contornos de contraste. Protección predeterminada: 85%. Conserva los píxeles opacos y el RGB de cada píxel que permanece visible; exporta alfa 0/255.
- **DTF · Completo:** trama cualquier transparencia sin reforzar los contornos.
- **DTF · Sólido:** convierte el alfa con un umbral del 50%.
- **DTF · Conservar alfa:** mantiene las semitransparencias para un RIP compatible.

El selector muestra cuatro texturas generadas por el mismo algoritmo de exportación: **Orgánico**, **Puntos** redondos, **Líneas** continuas y **Ordenado** clásico. Puntos y Líneas admiten un ángulo de 0–90°. La escala Fina / Media / Gruesa representa una separación de 8 / 12 / 16 píxeles originales; el grano orgánico usa bloques menores de 2 / 3 / 4 px. Son píxeles, no medidas físicas certificadas. La escala de impresión real debe acordarse con el taller.

**Proteger detalles** y **Limpiar restos** ajustan el acabado sin promediar los colores. Si aparecen puntos no deseados en caras o sombras, revisa también «Eliminar sombras» o el preset «Negro puro»: la limpieza de color puede introducir transparencias antes del tramado.

La vista general filtra las texturas menores que sus píxeles para evitar puntos exagerados. **Ver trama a tamaño real · 1:1** abre el detalle a escala de píxel original; el indicador **DETALLE NATIVO** confirma cuándo se está mostrando el recorte original procesado. La trama mantiene su posición al desplazar el lienzo y coincide con la exportación. En PNG grandes se decodifica solo el recorte solicitado, sujeto a los límites del navegador. Una decodificación fallida se comunica mediante un popup y conserva la vista general.

El diagnóstico DTF estima trazos e islas sobre la vista general. Distingue la cobertura filtrada de la vista previa del alfa binario que generará el PNG; no sustituye la revisión 1:1 ni una prueba física.

La sección **04 / Gestión de color** aplica el camino de dibujo sRGB del navegador (decodificación con gestión ICC cuando el navegador admite el perfil → Canvas2D sRGB). Permite **incrustar un perfil ICC sRGB real** como chunk \`iCCP\` comprimido, activado por defecto. Esto es distinto de limitarse a etiquetar un archivo arbitrario como sRGB. El PNG se verifica como **RGBA de 8 bits por canal**, y se valida que la incrustación ICC y los **300 ppp** solicitados estén presentes. La conversión de perfiles de entrada no reconocidos depende del soporte del navegador; no se garantiza una equivalencia exacta con el motor ICC de Photoshop para todos los perfiles.

Las opciones se aplican tanto a **Exportar PNG** como a cada archivo del **ZIP por lotes**, preservando la relación de aspecto y recortando solo los márgenes transparentes exteriores. Los cambios de impresión/color invalidan la indicación de estado de un lote anterior. Los PNG pueden ser voluminosos por sus dimensiones aunque sean de 8 bits.

QA técnico: ejecutar \`npm run qa:images\` para comprobar geometría nativa, cobertura de los puntos, continuidad de recortes y franjas con rotación, alfa binaria de exportación, estructura compacta de controles, integridad real del perfil ICC sRGB descomprimido, profundidad de 8 bits RGBA y densidad 300 ppp. Ejecutar además \`npm run build\` antes del deploy. Las pruebas de RIP y de impresión física son necesarias para calibrar el tramado y no se sustituyen por este QA.

### Compresión PNG sin pérdida — Oxipng

La sección **05 / Optimización PNG** incorpora **Oxipng WebAssembly** local, activado por defecto. Tras limpiar la imagen, procesar la transparencia DTG/DTF, agregar los metadatos de 300 ppp (\`pHYs\`) e incrustar el ICC sRGB (\`iCCP\`), el PNG se entrega al compresor mediante un **Web Worker**.

- Compresión **sin cuantización ni cambios deliberados de los píxeles**, con \`optimiseAlpha: false\` (no modifica RGB de píxeles invisibles). Nivel 3 para equilibrar tiempo y peso.
- El archivo optimizado se acepta **solo si es más pequeño** y mantiene dimensiones, RGBA 8 bits por canal, presencia ICC y los ppp del original. Cualquier fallo, agotamiento de tiempo o resultado incompatible **conserva el PNG anterior**.
- El proceso ocurre en el navegador: no se envía el diseño a servicios externos. Usa Vite para empaquetar el código WASM.
- La compresión tarda más que la codificación PNG nativa, especialmente con imágenes complejas; la barra muestra el estado. Se aplica a cada PNG del ZIP **secuencialmente** y presenta los MB totales ahorrados.
- Por seguridad, se omite automáticamente para imágenes de más de 20 MP en móviles y 34 MP en escritorio, sin impedir la exportación del PNG original; la memoria disponible depende del navegador y el dispositivo.
- Los resultados varían con el ruido, degradados y el tramado. No se promete llegar a un peso concreto como 10 MB: el modo no reduce colores ni transparencia para conseguir ese número.
- El build conserva \`npm ci\` mediante versiones de \`@jsquash/oxipng\` y \`wasm-feature-detect\` fijadas en \`package-lock.json\`.

### Inspección del preview

- Rueda del mouse sobre la imagen: zoom **centrado en el punto del cursor**, desde 100% (ajustado) hasta 6400%; el porcentaje es relativo al encuadre inicial. El botón 1:1 calcula aparte la escala nativa.
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
