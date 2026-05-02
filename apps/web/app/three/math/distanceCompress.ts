import { KM_TO_SCENE } from '@universe/shared'

/**
 * Map a real km distance to scene units, with logarithmic compression past
 * lunar distance.
 *
 * Why: physically real distances make this scene unusable. The Moon is at
 * ~60 scene units (real), the Sun at 23,455, Saturn at >200,000. Putting them
 * to scale means either (a) Earth becomes sub-pixel when Saturn is in frame,
 * or (b) Saturn is millions of times beyond `controls.maxDistance`.
 *
 * The mapping below is identity (linear) up to 500,000 km — so the Moon and
 * everything closer keep their true geometry — and then transitions to
 * log10 with a 200-unit-per-decade gain. Result:
 *   - Moon (~384,400 km)         → ~60 units (real)
 *   - Sun (~150 M km)            → ~573 units
 *   - Mars near opposition       → ~520 units
 *   - Jupiter                    → ~690 units
 *   - Saturn                     → ~770 units
 * All comfortably inside `controls.maxDistance = 1000` while remaining
 * visually ordered by their real distance.
 */

const CUTOFF_KM = 500_000
const UNITS_PER_DECADE = 200
const BASE_UNITS = CUTOFF_KM * KM_TO_SCENE // ~78.4

export function compressKmToScene(km: number): number {
  if (km <= CUTOFF_KM) return km * KM_TO_SCENE
  const decadesAbove = Math.log10(km / CUTOFF_KM)
  return BASE_UNITS + decadesAbove * UNITS_PER_DECADE
}

/**
 * Compress a 3D km vector into scene units while preserving its direction.
 * The magnitude is non-linearly compressed beyond lunar distance.
 */
export function compressVector(
  km: { x: number; y: number; z: number },
  out: { x: number; y: number; z: number },
): void {
  const mag = Math.sqrt(km.x * km.x + km.y * km.y + km.z * km.z)
  if (mag < 1e-6) {
    out.x = 0
    out.y = 0
    out.z = 0
    return
  }
  const compressed = compressKmToScene(mag)
  const scale = compressed / mag
  out.x = km.x * scale
  out.y = km.y * scale
  out.z = km.z * scale
}
