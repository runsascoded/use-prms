import { useState, useMemo } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'

const themes = ['light', 'dark', 'auto'] as const
export type Theme = typeof themes[number]
export { themes }

const metrics = { Rides: 'r', Minutes: 'm', Distance: 'd' } as const
export type Metric = keyof typeof metrics
export { metrics }

const regions = ['NYC', 'JC', 'HOB'] as const
export type Region = typeof regions[number]
const regionCodes = { NYC: 'n', JC: 'j', HOB: 'h' } as const
export { regions, regionCodes }

function UrlDisplay({ search, activeKeys, onReset, mode }: { search: string; activeKeys: string[]; onReset: () => void; mode: 'query' | 'hash' }) {
  const segments = useMemo(() => {
    if (!search) return []
    const params = search.slice(1).split('&')
    const firstPrefix = mode === 'hash' ? '#' : '?'
    return params.map((param, i) => {
      const key = param.split('=')[0]
      const prefix = i === 0 ? firstPrefix : '&'
      return { key, text: prefix + param }
    })
  }, [search, mode])

  return (
    <div className="url-bar">
      <div className="url-bar-header">
        <span className="url-bar-label">Preview</span>
        {search && (
          <button className="url-reset" onClick={onReset} title="Reset all params">
            ×
          </button>
        )}
      </div>
      <div className="url-display">
        /
        {segments.map((seg, i) => (
          <span key={i} className={activeKeys.includes(seg.key) ? 'highlight' : ''}>
            {seg.text}
          </span>
        ))}
      </div>
    </div>
  )
}

export interface ParamValues {
  enabled: boolean
  setEnabled: (v: boolean) => void
  name: string | undefined
  setName: (v: string | undefined) => void
  count: number
  setCount: (v: number) => void
  ratio: number
  setRatio: (v: number) => void
  theme: Theme
  setTheme: (v: Theme) => void
  tags: string[]
  setTags: (v: string[]) => void
  page: { offset: number; pageSize: number }
  setPage: (v: { offset: number; pageSize: number }) => void
  metric: Metric
  setMetric: (v: Metric) => void
  selectedRegions: Region[]
  setSelectedRegions: (v: Region[]) => void
  multiTags: string[]
  setMultiTags: (v: string[]) => void
  multiIds: number[]
  setMultiIds: (v: number[]) => void
  batch: { x: number; y: number }
  setBatch: (v: Partial<{ x: number; y: number }>) => void
}

interface ParamsDemoProps extends ParamValues {
  mode: 'query' | 'hash'
}

export function ParamsDemo({
  mode,
  enabled, setEnabled,
  name, setName,
  count, setCount,
  ratio, setRatio,
  theme, setTheme,
  tags, setTags,
  page, setPage,
  metric, setMetric,
  selectedRegions, setSelectedRegions,
  multiTags, setMultiTags,
  multiIds, setMultiIds,
  batch, setBatch,
}: ParamsDemoProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeKeys, setActiveKeys] = useState<string[]>([])

  const activate = (...keys: string[]) => () => setActiveKeys(keys)
  const deactivate = () => setActiveKeys([])

  const search = mode === 'hash' ? location.hash : location.search
  const params = search.slice(1) // Remove leading ? or #

  // Build link to alternate mode, preserving params
  const altPath = mode === 'query' ? '/hash' : '/'
  const altLink = mode === 'query'
    ? { pathname: altPath, hash: params ? `#${params}` : '' }
    : { pathname: altPath, search: params ? `?${params}` : '' }

  const handleReset = () => {
    navigate(location.pathname, { replace: true })
  }

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter(t => t !== tag))
    } else {
      setTags([...tags, tag])
    }
  }

  const toggleRegion = (region: Region) => {
    if (selectedRegions.includes(region)) {
      setSelectedRegions(selectedRegions.filter(r => r !== region))
    } else {
      setSelectedRegions([...selectedRegions, region])
    }
  }

  const toggleMultiTag = (tag: string) => {
    if (multiTags.includes(tag)) {
      setMultiTags(multiTags.filter(t => t !== tag))
    } else {
      setMultiTags([...multiTags, tag])
    }
  }

  return (
    <>
      <h1>use-prms</h1>
      <p className="subtitle">
        Type-safe URL parameter management with minimal encoding.
      </p>
      <p className="intro">
        Interact with the controls below to see how values are encoded in the URL.
        {mode === 'query' ? ' Parameters appear in the query string (?key=value).' : ' Parameters appear in the hash fragment (#key=value).'}
        {' '}<Link to={altLink}>Try {mode === 'query' ? 'hash' : 'query'} params instead.</Link>
      </p>

      <UrlDisplay search={search} activeKeys={activeKeys} onReset={handleReset} mode={mode} />

      {/* Boolean */}
      <section className="section" onMouseEnter={activate('e')} onMouseLeave={deactivate}>
        <h2>Boolean (boolParam)</h2>
        <div className="controls">
          <button
            className={enabled ? 'active' : ''}
            onClick={() => setEnabled(!enabled)}
            onFocus={activate('e')}
            onBlur={deactivate}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </section>

      {/* String */}
      <section className="section" onMouseEnter={activate('n')} onMouseLeave={deactivate}>
        <h2>String (stringParam)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Name</label>
            <input
              type="text"
              value={name ?? ''}
              onChange={e => setName(e.target.value || undefined)}
              onFocus={activate('n')}
              onBlur={deactivate}
              placeholder="Enter name..."
            />
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="section" onMouseEnter={activate('c', 'r')} onMouseLeave={deactivate}>
        <h2>Numbers (intParam, floatParam)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Count (int, default=0)</label>
            <input
              type="number"
              value={count}
              onChange={e => setCount(parseInt(e.target.value) || 0)}
              onFocus={activate('c')}
              onBlur={deactivate}
            />
          </div>
          <div className="control-group">
            <label>Ratio (float, default=1.0)</label>
            <input
              type="number"
              step="0.1"
              value={ratio}
              onChange={e => setRatio(parseFloat(e.target.value) || 1.0)}
              onFocus={activate('r')}
              onBlur={deactivate}
            />
          </div>
        </div>
      </section>

      {/* Enum */}
      <section className="section" onMouseEnter={activate('t')} onMouseLeave={deactivate}>
        <h2>Enum (enumParam)</h2>
        <div className="controls">
          {themes.map(t => (
            <button
              key={t}
              className={theme === t ? 'active' : ''}
              onClick={() => setTheme(t)}
              onFocus={activate('t')}
              onBlur={deactivate}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Strings Array */}
      <section className="section" onMouseEnter={activate('tags')} onMouseLeave={deactivate}>
        <h2>String Array (stringsParam)</h2>
        <div className="controls">
          <div className="tag-list">
            {['react', 'vue', 'svelte', 'solid'].map(tag => (
              <span
                key={tag}
                className={`tag ${tags.includes(tag) ? 'selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pagination */}
      <section className="section" onMouseEnter={activate('p')} onMouseLeave={deactivate}>
        <h2>Pagination (paginationParam)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Offset</label>
            <input
              type="number"
              value={page.offset}
              step={page.pageSize}
              onChange={e => setPage({ ...page, offset: parseInt(e.target.value) || 0 })}
              onFocus={activate('p')}
              onBlur={deactivate}
            />
          </div>
          <div className="control-group">
            <label>Page Size</label>
            <select
              value={page.pageSize}
              onChange={e => setPage({ ...page, pageSize: parseInt(e.target.value) })}
              onFocus={activate('p')}
              onBlur={deactivate}
            >
              {[10, 20, 50, 100].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setPage({ ...page, offset: page.offset + page.pageSize })}
            onFocus={activate('p')}
            onBlur={deactivate}
          >
            Next Page
          </button>
        </div>
      </section>

      {/* Code Params */}
      <section className="section" onMouseEnter={activate('y', 'rg')} onMouseLeave={deactivate}>
        <h2>Code Mapping (codeParam, codesParam)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Metric (single)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(Object.keys(metrics) as Metric[]).map(m => (
                <button
                  key={m}
                  className={metric === m ? 'active' : ''}
                  onClick={() => setMetric(m)}
                  onFocus={activate('y')}
                  onBlur={deactivate}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <label>Regions (multi)</label>
            <div className="tag-list">
              {regions.map(r => (
                <span
                  key={r}
                  className={`tag ${selectedRegions.includes(r) ? 'selected' : ''}`}
                  onClick={() => toggleRegion(r)}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Multi-value params */}
      <section className="section" onMouseEnter={activate('tag', 'id')} onMouseLeave={deactivate}>
        <h2>Multi-Value (useMultiUrlParam)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Tags (repeated keys)</label>
            <div className="tag-list">
              {['alpha', 'beta', 'gamma'].map(tag => (
                <span
                  key={tag}
                  className={`tag ${multiTags.includes(tag) ? 'selected' : ''}`}
                  onClick={() => toggleMultiTag(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="control-group">
            <label>IDs</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3].map(id => (
                <button
                  key={id}
                  className={multiIds.includes(id) ? 'active' : ''}
                  onClick={() => {
                    if (multiIds.includes(id)) {
                      setMultiIds(multiIds.filter(i => i !== id))
                    } else {
                      setMultiIds([...multiIds, id])
                    }
                  }}
                  onFocus={activate('id')}
                  onBlur={deactivate}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Batch Updates */}
      <section className="section" onMouseEnter={activate('x', 'y')} onMouseLeave={deactivate}>
        <h2>Batch Updates (useUrlParams)</h2>
        <div className="controls">
          <div className="control-group">
            <label>X</label>
            <input
              type="number"
              value={batch.x}
              onChange={e => setBatch({ x: parseInt(e.target.value) || 0 })}
              onFocus={activate('x')}
              onBlur={deactivate}
            />
          </div>
          <div className="control-group">
            <label>Y</label>
            <input
              type="number"
              value={batch.y}
              onChange={e => setBatch({ y: parseInt(e.target.value) || 0 })}
              onFocus={activate('y')}
              onBlur={deactivate}
            />
          </div>
          <button
            onClick={() => setBatch({ x: 100, y: 200 })}
            onFocus={activate('x', 'y')}
            onBlur={deactivate}
          >
            Set (100, 200)
          </button>
          <button
            onClick={() => setBatch({ x: 0, y: 0 })}
            onFocus={activate('x', 'y')}
            onBlur={deactivate}
          >
            Reset
          </button>
        </div>
      </section>
    </>
  )
}
