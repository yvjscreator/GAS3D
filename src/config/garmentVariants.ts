import type { DesignCombination, GarmentVariantId, PrintPlacement, PrintSettings, VariantAsset, VariantAssetRole } from '../types/studio'

export type GarmentVariantPreset = {
  id: GarmentVariantId
  label: string
  largePlacement: PrintPlacement
  smallPlacement: PrintPlacement
  focusPlacement: PrintPlacement
}

export const garmentVariantPresets: GarmentVariantPreset[] = [
  { id: 'frontLeftSleeve', label: 'Frente + manga izq.', largePlacement: 'frontCenter', smallPlacement: 'leftSleeve', focusPlacement: 'frontCenter' },
  { id: 'frontBack', label: 'Frente + espalda', largePlacement: 'frontCenter', smallPlacement: 'backCenter', focusPlacement: 'frontCenter' },
  { id: 'backRightSleeve', label: 'Espalda + manga der.', largePlacement: 'backCenter', smallPlacement: 'rightSleeve', focusPlacement: 'backCenter' },
  { id: 'backChest', label: 'Espalda + pecho', largePlacement: 'backCenter', smallPlacement: 'frontChest', focusPlacement: 'backCenter' },
]

export const getGarmentVariantPreset = (id: GarmentVariantId) => garmentVariantPresets.find((preset) => preset.id === id) ?? garmentVariantPresets[0]

export function hasVariantLibrary(assets: Record<VariantAssetRole, VariantAsset>) {
  return Boolean(assets.large.name && assets.small.name)
}

export function createVariantPrints(
  prints: Record<PrintPlacement, PrintSettings>,
  assets: Record<VariantAssetRole, VariantAsset>,
  variantId: GarmentVariantId,
) {
  const preset = getGarmentVariantPreset(variantId)
  const result: PrintSettings[] = Object.values(prints).map((print) => ({ ...print, url: null, name: null }))
  const assign = (placement: PrintPlacement, asset: VariantAsset) => {
    const target = result.find((print) => print.placement === placement)
    if (target) { target.url = asset.url; target.name = asset.name }
  }
  assign(preset.largePlacement, assets.large)
  assign(preset.smallPlacement, assets.small)
  return result
}

export function createCombinationPrints(combination: DesignCombination, assets: Record<VariantAssetRole, VariantAsset>) {
  const result: PrintSettings[] = Object.values(combination.printSettings).map((print) => ({ ...print, url: null, name: null }))
  const main = result.find((print) => print.placement === combination.mainPlacement)
  const companion = result.find((print) => print.placement === combination.companionPlacement)
  if (main) Object.assign(main, { url: assets.large.url, name: assets.large.name, placement: combination.mainPlacement })
  if (companion) Object.assign(companion, { url: assets.small.url, name: assets.small.name, placement: combination.companionPlacement })
  return result
}
