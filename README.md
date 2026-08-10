# 3D Garment Ad Studio

Estudio local para crear anuncios con una remera 3D, diseños transparentes, fondos y exportación de video.

## Ejecutar

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Modelos

Coloca modelos licenciados en `public/assets/models/garments/` y regístralos en `src/config/garmentModels.ts`. Este primer proyecto no recibió un modelo 3D de origen, por lo que incluye una remera procedural local como respaldo funcional.

## Arquitectura

`GarmentViewer` es el visor 3D reutilizable: no depende de la interfaz del estudio y acepta prenda, estampado y animación mediante props. `GarmentAdStudio` compone el editor, controles de medios, preview y exportación.

## Limitaciones observadas

La exportación usa `MediaRecorder`; en navegadores habituales se genera WebM. La calibración definitiva de zonas de impresión debe hacerse al incorporar el modelo de remera real.
