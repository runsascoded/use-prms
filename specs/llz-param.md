# Add `llzParam`: lat/lng/zoom URL parameter for map views

## Motivation

Any app with a MapLibre/Leaflet/Mapbox map wants to persist the view state (center + zoom) in the URL. This is currently hand-rolled in each project (ctbk, JCT, hudson-transit). A built-in `llzParam` would provide a standard, compact encoding.

## API

```typescript
import { llzParam } from 'use-prms'

// Basic: lat+lng+zoom, string encoding
const [view, setView] = useUrlState('ll', llzParam({
  default: { lat: 40.74, lng: -74.012, zoom: 11.8 },
}))
// URL: ?ll=40.7400_-74.0120_11.80
// Default view → absent from URL

// Custom precision
llzParam({
  default: { lat: 40.74, lng: -74.012, zoom: 11.8 },
  latLngDecimals: 5,  // default: 4
  zoomDecimals: 1,     // default: 2
})

// With pitch and bearing (for 3D map views)
llzParam({
  default: { lat: 40.74, lng: -74.012, zoom: 11.8, pitch: 0, bearing: 0 },
  pitchDecimals: 0,    // default: 0
  bearingDecimals: 0,  // default: 0
})
// URL: ?ll=40.7400_-74.0120_11.80+45+30
```

## Types

```typescript
interface LLZ {
  lat: number
  lng: number
  zoom: number
  pitch?: number
  bearing?: number
}

interface LLZParamOptions {
  default: LLZ
  latLngDecimals?: number  // default: 4 (≈11m precision)
  zoomDecimals?: number    // default: 2
  pitchDecimals?: number   // default: 0
  bearingDecimals?: number // default: 0
  delimiter?: string       // default: '_' (URL-safe; '+' gets decoded as space in query strings)
}
```

Type: `Param<LLZ>`

## Encoding

`_` delimiter between fields (URL-safe; `+` gets decoded as space in query strings):

| Field | Default precision | Example |
|-------|-------------------|---------|
| lat | 4 decimals | `40.7400` |
| lng | 4 decimals | `-74.0120` |
| zoom | 2 decimals | `11.80` |
| pitch | 0 decimals (optional) | `45` |
| bearing | 0 decimals (optional) | `30` |

Result: `40.7400_-74.0120_11.80` (3 fields) or `40.7400_-74.0120_11.80_45_30` (5 fields).

### Default elision

When the encoded value matches the default (within precision tolerance), `encode` returns `undefined` (absent from URL). This avoids cluttering the URL when the map is at its initial position.

### Decode

- Absent/empty → default value
- Split on delimiter, parse each field as float
- Missing fields (e.g. 3 fields when pitch/bearing expected) → use defaults for missing
- Invalid → default value

## Implementation

```typescript
export function llzParam(opts: LLZParamOptions): Param<LLZ> {
  const { default: def, latLngDecimals = 4, zoomDecimals = 2, pitchDecimals = 0, bearingDecimals = 0, delimiter = '_' } = opts
  const hasPB = def.pitch !== undefined || def.bearing !== undefined

  function fmt(v: number, dec: number): string {
    return v.toFixed(dec)
  }

  function eq(a: LLZ, b: LLZ): boolean {
    const llEps = 0.5 * Math.pow(10, -latLngDecimals)
    const zEps = 0.5 * Math.pow(10, -zoomDecimals)
    if (Math.abs(a.lat - b.lat) > llEps) return false
    if (Math.abs(a.lng - b.lng) > llEps) return false
    if (Math.abs(a.zoom - b.zoom) > zEps) return false
    if (hasPB) {
      const pEps = 0.5 * Math.pow(10, -pitchDecimals)
      const bEps = 0.5 * Math.pow(10, -bearingDecimals)
      if (Math.abs((a.pitch ?? 0) - (b.pitch ?? 0)) > pEps) return false
      if (Math.abs((a.bearing ?? 0) - (b.bearing ?? 0)) > bEps) return false
    }
    return false
  }

  return {
    encode(v: LLZ): string | undefined {
      if (eq(v, def)) return undefined
      const parts = [fmt(v.lat, latLngDecimals), fmt(v.lng, latLngDecimals), fmt(v.zoom, zoomDecimals)]
      if (hasPB) {
        parts.push(fmt(v.pitch ?? 0, pitchDecimals), fmt(v.bearing ?? 0, bearingDecimals))
      }
      return parts.join(delimiter)
    },
    decode(s: string | null): LLZ {
      if (!s) return def
      const parts = s.split(delimiter).map(Number)
      return {
        lat: isNaN(parts[0]) ? def.lat : parts[0],
        lng: isNaN(parts[1]) ? def.lng : parts[1],
        zoom: isNaN(parts[2]) ? def.zoom : parts[2],
        ...(hasPB ? {
          pitch: isNaN(parts[3]) ? (def.pitch ?? 0) : parts[3],
          bearing: isNaN(parts[4]) ? (def.bearing ?? 0) : parts[4],
        } : {}),
      }
    },
  }
}
```

## Tests

```typescript
describe('llzParam', () => {
  const def = { lat: 40.74, lng: -74.012, zoom: 11.8 }
  const p = llzParam({ default: def })

  test('encode default → undefined', () => {
    expect(p.encode(def)).toBeUndefined()
  })

  test('encode non-default → delimited string', () => {
    expect(p.encode({ lat: 40.76, lng: -73.98, zoom: 13 }))
      .toBe('40.7600_-73.9800_13.00')
  })

  test('decode absent → default', () => {
    expect(p.decode(null)).toEqual(def)
  })

  test('round-trip', () => {
    const v = { lat: 40.7586, lng: -73.9854, zoom: 14.25 }
    expect(p.decode(p.encode(v)!)).toEqual({
      lat: 40.7586, lng: -73.9854, zoom: 14.25,
    })
  })

  test('partial decode fills defaults', () => {
    // If someone hand-edits the URL to only have 2 fields
    expect(p.decode('40.76+-73.98')).toEqual({
      lat: 40.76, lng: -73.98, zoom: def.zoom,
    })
  })

  describe('with pitch/bearing', () => {
    const p5 = llzParam({ default: { ...def, pitch: 0, bearing: 0 } })

    test('encode with pitch/bearing', () => {
      expect(p5.encode({ lat: 40.76, lng: -73.98, zoom: 13, pitch: 45, bearing: 30 }))
        .toBe('40.7600_-73.9800_13.00_45_30')
    })
  })
})
```

## Downstream

Once published, hudson-transit replaces inline `llzParam` in `GeoSankey.tsx`:

```typescript
import { llzParam } from 'use-prms'

const [mapView, setMapView] = useUrlState('ll', llzParam({
  default: { lat: 40.740, lng: -74.012, zoom: 11.8 },
}))
```
