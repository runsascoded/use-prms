import { useCallback, useMemo } from 'react'
import Map, { type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import { llzParam, type LLZ, type Param } from 'use-prms'
import 'maplibre-gl/dist/maplibre-gl.css'

type UseUrlParamHook = <T>(key: string, param: Param<T>, options?: { debounce?: number }) => [T, (v: T) => void]

const DEFAULT_VIEW: LLZ = { lat: 40.7580, lng: -73.9855, zoom: 12 }

// Free tile source (no API key needed)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export function MapDemo({ useUrlState }: { useUrlState: UseUrlParamHook }) {
  const viewParam = useMemo(() => llzParam({
    default: DEFAULT_VIEW,
    latLngDecimals: 4,
    zoomDecimals: 2,
  }), [])

  const [view, setView] = useUrlState('ll', viewParam, { debounce: 150 })

  const handleMove = useCallback((e: ViewStateChangeEvent) => {
    const { latitude, longitude, zoom } = e.viewState
    setView({ lat: latitude, lng: longitude, zoom })
  }, [setView])

  const handleReset = useCallback(() => {
    setView(DEFAULT_VIEW)
  }, [setView])

  const isDefault = !viewParam.encode(view)

  return (
    <section id="section-map" className="section float-section">
      <h2>Map View (llzParam)</h2>
      <p className="section-intro">
        Encodes lat, lng, and zoom in a single URL param with <code>_</code> delimiter.
        Drag the map to see the URL update (debounced at 150ms).
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 300px', minWidth: 300, height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #e0e0e0)' }}>
          <Map
            latitude={view.lat}
            longitude={view.lng}
            zoom={view.zoom}
            onMove={handleMove}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem' }}>
          <div><strong>lat:</strong> {view.lat.toFixed(4)}</div>
          <div><strong>lng:</strong> {view.lng.toFixed(4)}</div>
          <div><strong>zoom:</strong> {view.zoom.toFixed(2)}</div>
          <div style={{ marginTop: '0.5rem' }}>
            <strong>encoded:</strong>{' '}
            <code>{viewParam.encode(view) ?? '(default, omitted)'}</code>
          </div>
          <button onClick={handleReset} disabled={isDefault} style={{ marginTop: '0.5rem' }}>
            Reset to default
          </button>
        </div>
      </div>

      <details className="code-sample">
        <summary>Code</summary>
        <pre>{`import { useUrlState, llzParam } from 'use-prms'

const [view, setView] = useUrlState('ll', llzParam({
  default: { lat: 40.7580, lng: -73.9855, zoom: 12 },
  latLngDecimals: 4,
  zoomDecimals: 2,
}), { debounce: 150 })`}</pre>
      </details>
    </section>
  )
}
