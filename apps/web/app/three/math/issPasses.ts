import * as satellite from 'satellite.js'

export interface PassPrediction {
  /** When the ISS rises above the horizon for the observer. */
  riseAt: Date
  /** Highest elevation reached during this pass (degrees). */
  maxElevationDeg: number
  /** When the ISS falls back below the horizon. */
  setAt: Date
  /** Pass duration in seconds. */
  durationSec: number
}

interface ObserverGd {
  latitude: number
  longitude: number
  height: number
}

/**
 * Brute-force scan over a future time window to find the next visible ISS
 * pass for an observer at (lat, lon). We step in 60 s buckets first to find
 * crossings, then refine with 5 s steps inside each candidate window. Good
 * enough for "ISS overhead in 12 min" countdowns; for higher precision
 * (e.g., visible-only passes that account for sun position) a more elaborate
 * algorithm is warranted but overkill here.
 *
 * Inputs:
 *   - satrec: a satellite.js SatRec already initialised from a TLE.
 *   - lat/lon: observer geodetic.
 *   - lookaheadSec: how far into the future to scan (default 6 h).
 */
export function findNextPass(
  satrec: satellite.SatRec,
  latDeg: number,
  lonDeg: number,
  fromDate: Date = new Date(),
  lookaheadSec: number = 6 * 3600,
): PassPrediction | null {
  const observer: ObserverGd = {
    latitude: (latDeg * Math.PI) / 180,
    longitude: (lonDeg * Math.PI) / 180,
    height: 0,
  }

  const STEP_COARSE = 60
  const STEP_FINE = 5
  let lastEl = -Infinity
  let riseDate: Date | null = null
  let maxEl = -Infinity
  let setDate: Date | null = null

  for (let t = 0; t < lookaheadSec; t += STEP_COARSE) {
    const date = new Date(fromDate.getTime() + t * 1000)
    const el = elevationAt(satrec, observer, date)
    if (el === null) continue
    if (lastEl <= 0 && el > 0 && riseDate === null) {
      // Rising crossing somewhere in the previous coarse step. Refine.
      const start = new Date(date.getTime() - STEP_COARSE * 1000)
      for (let f = 0; f < STEP_COARSE; f += STEP_FINE) {
        const d = new Date(start.getTime() + f * 1000)
        const e = elevationAt(satrec, observer, d)
        if (e !== null && e > 0) {
          riseDate = d
          break
        }
      }
      if (!riseDate) riseDate = date
      maxEl = el
    } else if (riseDate !== null) {
      if (el > maxEl) maxEl = el
      if (el <= 0) {
        // Setting crossing. Refine.
        const start = new Date(date.getTime() - STEP_COARSE * 1000)
        for (let f = 0; f < STEP_COARSE; f += STEP_FINE) {
          const d = new Date(start.getTime() + f * 1000)
          const e = elevationAt(satrec, observer, d)
          if (e !== null && e <= 0) {
            setDate = d
            break
          }
        }
        if (!setDate) setDate = date
        break
      }
    }
    lastEl = el
  }

  if (riseDate === null || setDate === null) return null
  return {
    riseAt: riseDate,
    maxElevationDeg: (maxEl * 180) / Math.PI,
    setAt: setDate,
    durationSec: (setDate.getTime() - riseDate.getTime()) / 1000,
  }
}

function elevationAt(satrec: satellite.SatRec, observer: ObserverGd, date: Date): number | null {
  const pv = satellite.propagate(satrec, date)
  if (!pv.position || typeof pv.position === 'boolean') return null
  const gmst = satellite.gstime(date)
  const ecf = satellite.eciToEcf(pv.position, gmst)
  const look = satellite.ecfToLookAngles(observer, ecf)
  return look.elevation
}
