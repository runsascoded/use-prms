import { useState, useCallback, useMemo, useRef } from 'react'
import Map, { type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import { llzParam, type LLZ, type Param } from 'use-prms'
import 'maplibre-gl/dist/maplibre-gl.css'

type UseUrlParamHook = <T>(key: string, param: Param<T>, options?: { debounce?: number }) => [T, (v: T) => void]

const DEFAULT_VIEW: LLZ = { lat: 40.7580, lng: -73.9855, zoom: 12 }

// Free tile source (no API key needed)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const mapInnerStyle = { width: '100%', height: '100%' } as const

export function MapDemo({ useUrlState }: { useUrlState: UseUrlParamHook }) {
  const viewParam = useMemo(() => llzParam({
    default: DEFAULT_VIEW,
    latLngDecimals: 4,
    zoomDecimals: 2,
  }), [])

  const [urlView, setUrlView] = useUrlState('ll', viewParam)

  // Live display state — updates on every move frame for responsive readout
  const [displayView, setDisplayView] = useState<LLZ>(urlView)

  const mapRef = useRef<MapRef>(null)
  const isProgrammatic = useRef(false)


  // Captured once on mount (uncontrolled map)
  const initialViewState = useMemo(() => ({
    latitude: urlView.lat,
    longitude: urlView.lng,
    zoom: urlView.zoom,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live coordinate updates during drag (triggers parent re-render, but
  // StableMap is memoized so the Map component itself is unaffected)
  const handleMove = useCallback((e: ViewStateChangeEvent) => {
    const { latitude, longitude, zoom } = e.viewState
    setDisplayView({ lat: latitude, lng: longitude, zoom })
  }, [])

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    if (isProgrammatic.current) {
      isProgrammatic.current = false
      return
    }
    const { latitude, longitude, zoom } = e.viewState
    const view = { lat: latitude, lng: longitude, zoom }
    setDisplayView(view)
    setUrlView(view)
  }, [setUrlView])

  const handleReset = useCallback(() => {
    isProgrammatic.current = true
    setDisplayView(DEFAULT_VIEW)
    setUrlView(DEFAULT_VIEW)
    mapRef.current?.jumpTo({
      center: [DEFAULT_VIEW.lng, DEFAULT_VIEW.lat],
      zoom: DEFAULT_VIEW.zoom,
    })
  }, [setUrlView])

  const isDefault = !viewParam.encode(displayView)

  return (
    <section id="section-map" className="section float-section">
      <h2>Map View (llzParam)</h2>
      <p className="section-intro">
        Encodes lat, lng, and zoom in a single URL param with <code>_</code> delimiter.
        Drag the map to see coordinates update live; URL updates when you release.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ width: '100%', height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #e0e0e0)' }}>
          <Map
            ref={mapRef}
            initialViewState={initialViewState}
            onMove={handleMove}
            onMoveEnd={handleMoveEnd}
            mapStyle={MAP_STYLE}
            style={mapInnerStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem', flexWrap: 'wrap' }}>
          <span><strong>lat:</strong> {displayView.lat.toFixed(4)}</span>
          <span><strong>lng:</strong> {displayView.lng.toFixed(4)}</span>
          <span><strong>zoom:</strong> {displayView.zoom.toFixed(2)}</span>
          <span>
            <strong>encoded:</strong>{' '}
            <code>{viewParam.encode(displayView) ?? '(default, omitted)'}</code>
          </span>
          <button onClick={handleReset} disabled={isDefault}>
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
}))`}</pre>
      </details>
    </section>
  )
}
