// Small geo helpers shared by the Church tab. Location is only ever used to
// find churches near you — we never store a player's coordinates, only the
// coordinates of the church they picked (which are public map data anyway).

export interface Coords {
  lat: number
  lng: number
}

/** Great-circle distance in miles. Mirrors miles_between() in SQL. */
export function milesBetween(a: Coords, b: Coords): number {
  const R = 3958.7613 // mean earth radius, miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return ''
  if (miles < 0.1) return 'right here'
  if (miles < 10) return `${miles.toFixed(1)} mi`
  // The worldwide board reaches four figures, so group them.
  return `${Math.round(miles).toLocaleString()} mi`
}

export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export class LocationError extends Error {
  kind: GeoError
  constructor(kind: GeoError, message: string) {
    super(message)
    this.kind = kind
  }
}

export const geoErrorMessage = (kind: GeoError): string => {
  switch (kind) {
    case 'denied':
      return "Location is blocked, so we can't look around you. Turn it on for Verse Arcade in your browser or phone settings — or just search by name and add your church by hand."
    case 'timeout':
      return "Couldn't get a fix on your location. Try again, or search by name."
    case 'unsupported':
      return "This device won't share a location. Search by name and add your church by hand."
    default:
      return "Your location isn't available right now. Try again, or search by name."
  }
}

/**
 * One-shot position. Deliberately coarse (no high-accuracy GPS wake-up): we're
 * looking for churches within tens of miles, so a cell/wifi fix is plenty and
 * it resolves far faster.
 *
 * The `timeout` option is not trustworthy inside a WKWebView — on iOS the
 * request goes through CoreLocation, and while the system permission sheet is
 * up (or authorisation is stuck "not determined") neither callback is
 * guaranteed to fire. So we run our own deadline on top of it: a caller must
 * always get either coordinates or an error, never a promise that hangs and a
 * screen that spins forever.
 */
export function getPosition(timeoutMs = 12000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('unsupported', 'Geolocation unsupported'))
      return
    }
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(
      () => finish(() => reject(new LocationError('timeout', 'Location timed out'))),
      // A little past the browser's own deadline, so its error (which carries a
      // better reason) wins whenever it does arrive.
      timeoutMs + 2000,
    )
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(() => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })),
      (err) =>
        finish(() => {
          const kind: GeoError =
            err.code === err.PERMISSION_DENIED
              ? 'denied'
              : err.code === err.TIMEOUT
                ? 'timeout'
                : 'unavailable'
          reject(new LocationError(kind, err.message || 'Location unavailable'))
        }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}
