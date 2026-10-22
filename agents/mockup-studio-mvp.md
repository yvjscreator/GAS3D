# GAS3D Mockup Studio — first functional release

Route: \`#/mockups\`; icon in the compact global app launcher.

This is a deterministic, fully client-side **photographic mockup editor**, not image generation. It lets users load two separate blank garment photos (front/back), upload independent transparent design PNGs, place and warp those prints, extract photo-based lighting/shading to blend the print into cloth, persist assets in IndexedDB and placements in localStorage, and export an individual PNG or a combined front/back PNG.

## Interaction
- Front/back independent template photo and print (tap either view; on mobile views use tabs).
- Drag the print within the photograph; drag four overlay handles to bend its quadrilateral/perspective. Size, rotation, and fabric lighting sliders.
- Browser-local asset replacement, including the original filenames; native-resolution export for base photos up to 20 MP and 8192 px/edge, with an explicit error for larger sources (no silent shrinking).
- Export single front/back or combined on white background with a narrow gutter; if the combination exceeds safe browser canvas limits, explain and offer individual exports.
- The print PNG itself is not modified/AI-regenerated, though mesh mapping necessarily resamples pixels. Pixel-wise luminosity modulation preserves bright colors on black cloth by using relative fabric intensity rather than Multiply with cloth RGB.
- Four moveable corners are manual placement guides, not an automatically generated dress mask. Content placed outside the garment may still appear outside; correct it by moving/warping, or author a template mask in the next phase.
- Photos with pre-existing artwork are not cleaned: use blank garment photos to avoid overprinting.
- Placement measurements are *relative to the photo*, not physical centimeters, until the photo is calibrated.

## Roadmap after MVP
1. Editable garment silhouette masks and shirt/fold displacement maps.
2. Template library (multiple named cuts/colors/angles), explicit print-zone measurements in centimeters calibrated against garment references.
3. More accurate curved-cloth warping, optional mask detection, multiple separate graphics per shirt, bulk mockup export and ZIP.

Do not describe this release as a fully photorealistic 3D drape engine. Verify visual results on desktop and phone before claiming device support.
