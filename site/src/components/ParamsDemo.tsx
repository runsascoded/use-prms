import { useState, useMemo } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { FaGithub, FaTimes } from 'react-icons/fa'
import Tooltip from '@mui/material/Tooltip'
import { clearParams, type Param } from 'use-prms'
import { FloatDemo } from './FloatDemo'

const themes = ['light', 'dark', 'auto'] as const
export type Theme = typeof themes[number]
export { themes }

// Color palette for param sections (soft pastels that work in light/dark)
const paramColors = [
  'rgba(99, 102, 241, 0.15)',   // indigo
  'rgba(236, 72, 153, 0.15)',   // pink
  'rgba(34, 197, 94, 0.15)',    // green
  'rgba(249, 115, 22, 0.15)',   // orange
  'rgba(14, 165, 233, 0.15)',   // sky
  'rgba(168, 85, 247, 0.15)',   // purple
  'rgba(234, 179, 8, 0.15)',    // yellow
  'rgba(20, 184, 166, 0.15)',   // teal
  'rgba(239, 68, 68, 0.15)',    // red
  'rgba(107, 114, 128, 0.15)',  // gray
] as const

// Stronger versions for hover
const paramColorsStrong = [
  'rgba(99, 102, 241, 0.35)',
  'rgba(236, 72, 153, 0.35)',
  'rgba(34, 197, 94, 0.35)',
  'rgba(249, 115, 22, 0.35)',
  'rgba(14, 165, 233, 0.35)',
  'rgba(168, 85, 247, 0.35)',
  'rgba(234, 179, 8, 0.35)',
  'rgba(20, 184, 166, 0.35)',
  'rgba(239, 68, 68, 0.35)',
  'rgba(107, 114, 128, 0.35)',
] as const

// Map param keys to color indices (params in same section share color)
const paramKeyColors: Record<string, number> = {
  e: 0,      // enabled (boolean)
  n: 1,      // name (string)
  c: 2,      // count (int) - Numbers section
  r: 2,      // ratio (float) - Numbers section (same color as c)
  t: 3,      // theme (enum)
  tags: 4,   // tags (strings array)
  p: 5,      // pagination
  y: 6,      // metric (code) - Code Mapping section
  rg: 6,     // regions (codes) - Code Mapping section (same color as y)
  tag: 7,    // multi tags - Multi-Value section
  id: 7,     // multi ids - Multi-Value section (same color as tag)
  bx: 8,     // batch x - Batch Updates section
  by: 8,     // batch y - Batch Updates section
  v: 9,      // binary float - Binary Encoding section
  f: 9,      // approx float - Approximate Encoding section
  xy: 9,     // point - Point Encoding section
}

// Keys that should highlight together (same section)
const keyGroups: string[][] = [
  ['c', 'r'],              // Numbers section
  ['y', 'rg'],             // Code Mapping section
  ['tag', 'id'],           // Multi-Value section
  ['bx', 'by'],            // Batch section
  ['v', 'f', 'xy'],        // Binary Encoding sections
]

// Map param keys to section ids for click-to-jump
const paramKeySections: Record<string, string> = {
  e: 'section-boolean',
  n: 'section-string',
  c: 'section-numbers',
  r: 'section-numbers',
  t: 'section-enum',
  tags: 'section-strings',
  p: 'section-pagination',
  y: 'section-codes',
  rg: 'section-codes',
  tag: 'section-multi',
  id: 'section-multi',
  bx: 'section-batch',
  by: 'section-batch',
  v: 'section-binary',
  f: 'section-approximate',
  xy: 'section-point',
}

// Expand a set of active keys to include all keys in the same group
function expandKeyGroups(keys: string[]): string[] {
  const expanded = new Set(keys)
  for (const key of keys) {
    for (const group of keyGroups) {
      if (group.includes(key)) {
        group.forEach(k => expanded.add(k))
      }
    }
  }
  return Array.from(expanded)
}

const metrics = { Rides: 'r', Minutes: 'm', Distance: 'd' } as const
export type Metric = keyof typeof metrics
export { metrics }

const regions = ['NYC', 'JC', 'HOB'] as const
export type Region = typeof regions[number]
const regionCodes = { NYC: 'n', JC: 'j', HOB: 'h' } as const
export { regions, regionCodes }

function UrlDisplay({
  search,
  activeKeys,
  onReset,
  mode,
  onHoverKey,
}: {
  search: string
  activeKeys: string[]
  onReset: () => void
  mode: 'query' | 'hash'
  onHoverKey: (keys: string[] | null) => void
}) {
  const segments = useMemo(() => {
    if (!search) return []
    const params = search.slice(1).split('&')
    const firstPrefix = mode === 'hash' ? '#' : '?'
    return params.map((param, i) => {
      const key = param.split('=')[0]
      const prefix = i === 0 ? firstPrefix : '&'
      const colorIdx = paramKeyColors[key] ?? 0
      return { key, text: prefix + param, colorIdx }
    })
  }, [search, mode])

  return (
    <div className="url-bar">
      <div className="url-bar-header">
        <span className="url-bar-label">Preview</span>
      </div>
      <div className="url-display">
        <span className="url-text">
          /
          {segments.map((seg, i) => {
            const isActive = activeKeys.includes(seg.key)
            const bgColor = isActive ? paramColorsStrong[seg.colorIdx] : paramColors[seg.colorIdx]
            const sectionId = paramKeySections[seg.key]
            const handleClick = sectionId ? () => {
              document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } : undefined
            return (
              <span
                key={i}
                className={isActive ? 'highlight' : ''}
                style={{ backgroundColor: bgColor, borderRadius: '3px', padding: '0 2px', cursor: sectionId ? 'pointer' : undefined }}
                onClick={handleClick}
                onMouseEnter={() => onHoverKey([seg.key])}
                onMouseLeave={() => onHoverKey(null)}
              >
                {seg.text}
              </span>
            )
          })}
        </span>
        {search && (
          <button className="url-reset" onClick={onReset} title="Reset all params">
            <FaTimes size={16} />
          </button>
        )}
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
  batch: { bx: number; by: number }
  setBatch: (v: Partial<{ bx: number; by: number }>) => void
  // Hook for FloatDemo (passed from parent to use correct mode)
  useUrlState: <T>(key: string, param: Param<T>, options?: { debounce?: number }) => [T, (v: T) => void]
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
  useUrlState,
}: ParamsDemoProps) {
  const location = useLocation()
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [urlHoverKeys, setUrlHoverKeys] = useState<string[] | null>(null)

  // Combined active keys from section hover and URL hover, expanded to include grouped keys
  const combinedActiveKeys = expandKeyGroups(urlHoverKeys ?? activeKeys)

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
    clearParams(mode)
  }

  // Get background color for a section based on its param keys
  const getSectionStyle = (keys: string[]) => {
    const isActive = keys.some(k => combinedActiveKeys.includes(k))
    const colorIdx = paramKeyColors[keys[0]] ?? 0
    return {
      backgroundColor: isActive ? paramColorsStrong[colorIdx] : paramColors[colorIdx],
    }
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
      <h1>
        use-prms
        {' '}<a href="https://github.com/runsascoded/use-prms" className="title-github" title="GitHub" target="_blank">
          <FaGithub size={24} />
        </a>
      </h1>
      <p className="badges">
        <a href="https://www.npmjs.com/package/use-prms" target="_blank"><img src="https://img.shields.io/npm/v/use-prms" alt="npm version" /></a>
        {' '}<a href="https://www.npmjs.com/package/use-prms" target="_blank"><img src="https://img.shields.io/npm/l/use-prms" alt="license" /></a>
        {' '}<a href="https://bundlephobia.com/package/use-prms" target="_blank"><img src="https://img.shields.io/bundlephobia/minzip/use-prms" alt="bundle size" /></a>
      </p>
      <p className="subtitle">
        Type-safe URL-parameter management hooks.
      </p>
      <div className="examples">
        <h2>Live examples</h2>
        <ul>
          <li>
            <a href="https://awair.runsascoded.com" target="_blank">awair.runsascoded.com</a>
            {' '}(e.g. <a href="https://awair.runsascoded.com/?d=+br&y=thZ&t=-3d" className="example-url" target="_blank">?d=+br&y=thZ&t=-3d</a>)
            {' '}<Tooltip title="View use-prms usage on GitHub" arrow><a href="https://github.com/search?q=repo%3Arunsascoded%2Fawair+use-prms&type=code" className="example-gh" target="_blank"><FaGithub size={18} /></a></Tooltip>
          </li>
          <li>
            <a href="https://ctbk.dev" target="_blank">ctbk.dev</a>
            {' '}(e.g. <a href="https://ctbk.dev/?y=m&s=b&rt=ce&d=2002-&pct" className="example-url" target="_blank">?y=m&s=b&rt=ce&d=2002-&pct</a>)
            {' '}<Tooltip title="View use-prms usage on GitHub" arrow><a href="https://github.com/search?q=repo%3Ahudcostreets%2Fctbk.dev+use-prms&type=code" className="example-gh" target="_blank"><FaGithub size={18} /></a></Tooltip>
          </li>
          <li>
            <a href="https://kbd.rbw.sh" target="_blank">kbd.rbw.sh</a>
            {' '}(e.g. <a href="https://kbd.rbw.sh/?t=dark" className="example-url" target="_blank">?t=dark</a>)
            {' '}<Tooltip title="View use-prms usage on GitHub" arrow><a href="https://github.com/search?q=repo%3Arunsascoded%2Fuse-kbd+use-prms&type=code" className="example-gh" target="_blank"><FaGithub size={18} /></a></Tooltip>
          </li>
        </ul>
      </div>
      <h2>Demo</h2>
      <p className="intro">
        Interact with the controls below to see how values are encoded in the URL.
        {mode === 'query' ? ' Parameters appear in the query string (?key=value).' : ' Parameters appear in the hash fragment (#key=value).'}
        {' '}<Link to={altLink}>{mode === 'query' ? 'Hash' : 'Query'} params are also supported.</Link>
      </p>
      <div className="examples">
        <h3>Examples:</h3>
        <ul>
          {mode === 'query' ? (
            <>
              <li><span className="try-label">Basics</span> <Link to="/?e&c=5&r=1.5" className="example-url">?e&c=5&r=1.5</Link></li>
              <li><span className="try-label">Text</span> <Link to="/?n=hello+world&tags=react+vue" className="example-url">?n=hello+world&tags=react+vue</Link></li>
              <li><span className="try-label">Full</span> <Link to="/?e&t=auto&p=40+50&y=m&rg=nj" className="example-url">?e&t=auto&p=40+50&y=m&rg=nj</Link></li>
            </>
          ) : (
            <>
              <li><span className="try-label">Basics</span> <Link to="/hash#e&c=5&r=1.5" className="example-url">#e&c=5&r=1.5</Link></li>
              <li><span className="try-label">Text</span> <Link to="/hash#n=hello+world&tags=react+vue" className="example-url">#n=hello+world&tags=react+vue</Link></li>
              <li><span className="try-label">Full</span> <Link to="/hash#e&t=auto&p=40+50&y=m&rg=nj" className="example-url">#e&t=auto&p=40+50&y=m&rg=nj</Link></li>
            </>
          )}
        </ul>
      </div>

      <UrlDisplay search={search} activeKeys={combinedActiveKeys} onReset={handleReset} mode={mode} onHoverKey={setUrlHoverKeys} />

      {/* Boolean */}
      <section id="section-boolean" className="section" style={getSectionStyle(['e'])} onMouseEnter={activate('e')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`const [enabled, setEnabled] = useUrlState('e', boolParam)`}</pre>
        </details>
      </section>

      {/* String */}
      <section id="section-string" className="section" style={getSectionStyle(['n'])} onMouseEnter={activate('n')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`const [name, setName] = useUrlState('n', stringParam())`}</pre>
        </details>
      </section>

      {/* Numbers */}
      <section id="section-numbers" className="section" style={getSectionStyle(['c', 'r'])} onMouseEnter={activate('c', 'r')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`const [count, setCount] = useUrlState('c', intParam(0))
const [ratio, setRatio] = useUrlState('r', floatParam(1.0))`}</pre>
        </details>
      </section>

      {/* Enum */}
      <section id="section-enum" className="section" style={getSectionStyle(['t'])} onMouseEnter={activate('t')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`const themes = ['light', 'dark', 'auto'] as const
type Theme = typeof themes[number]

const [theme, setTheme] = useUrlState('t', enumParam<Theme>('light', themes))`}</pre>
        </details>
      </section>

      {/* Strings Array */}
      <section id="section-strings" className="section" style={getSectionStyle(['tags'])} onMouseEnter={activate('tags')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`// Space-separated in URL: ?tags=react+vue
const [tags, setTags] = useUrlState('tags', stringsParam([], ' '))`}</pre>
        </details>
      </section>

      {/* Pagination */}
      <section id="section-pagination" className="section" style={getSectionStyle(['p'])} onMouseEnter={activate('p')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`// Encodes as offset+pageSize: ?p=40+50
const [page, setPage] = useUrlState('p', paginationParam({ offset: 0, pageSize: 10 }))`}</pre>
        </details>
      </section>

      {/* Code Params */}
      <section id="section-codes" className="section" style={getSectionStyle(['y', 'rg'])} onMouseEnter={activate('y', 'rg')} onMouseLeave={deactivate}>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`// Map display values to short codes: Rides↔r, Minutes↔m, Distance↔d
const metrics = { Rides: 'r', Minutes: 'm', Distance: 'd' } as const
const [metric, setMetric] = useUrlState('y', codeParam<Metric>('Rides', metrics))

// Multi-select codes: ?rg=nj (NYC + JC)
const regionCodes = { NYC: 'n', JC: 'j', HOB: 'h' } as const
const [regions, setRegions] = useUrlState('rg', codesParam<Region>([], regionCodes))`}</pre>
        </details>
      </section>

      {/* Multi-value params */}
      <section id="section-multi" className="section" style={getSectionStyle(['tag', 'id'])} onMouseEnter={activate('tag', 'id')} onMouseLeave={deactivate}>
        <h2>Multi-Value (useMultiUrlState)</h2>
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
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`// Repeated keys: ?tag=alpha&tag=beta&id=1&id=2
const [tags, setTags] = useMultiUrlState('tag', multiStringParam([]))
const [ids, setIds] = useMultiUrlState('id', multiIntParam([]))`}</pre>
        </details>
      </section>

      {/* Batch Updates */}
      <section id="section-batch" className="section" style={getSectionStyle(['bx', 'by'])} onMouseEnter={activate('bx', 'by')} onMouseLeave={deactivate}>
        <h2>Batch Updates (useUrlStates)</h2>
        <div className="controls">
          <div className="control-group">
            <label>X</label>
            <input
              type="number"
              value={batch.bx}
              onChange={e => setBatch({ bx: parseInt(e.target.value) || 0 })}
              onFocus={activate('bx')}
              onBlur={deactivate}
            />
          </div>
          <div className="control-group">
            <label>Y</label>
            <input
              type="number"
              value={batch.by}
              onChange={e => setBatch({ by: parseInt(e.target.value) || 0 })}
              onFocus={activate('by')}
              onBlur={deactivate}
            />
          </div>
          <button
            onClick={() => setBatch({ bx: 100, by: 200 })}
            onFocus={activate('bx', 'by')}
            onBlur={deactivate}
          >
            Set (100, 200)
          </button>
          <button
            onClick={() => setBatch({ bx: 0, by: 0 })}
            onFocus={activate('bx', 'by')}
            onBlur={deactivate}
          >
            Reset
          </button>
        </div>
        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`// Update multiple params in one history entry
const { values, setValues } = useUrlStates({
  bx: intParam(0),
  by: intParam(0),
})
// values.bx, values.by
// setValues({ bx: 100, by: 200 }) - updates both atomically`}</pre>
        </details>
      </section>

      {/* Advanced: Binary Encoding */}
      <hr className="section-divider" />
      <h2 className="advanced-header">Advanced: Binary Encoding</h2>
      <div className="section-intro">
        <p>
          Some data can be very verbose when stored naively in URLs (e.g. floating-point numbers). use-prms comes with built-in base64 encoding for binary data, which can be more compact than naive <code>toString</code> representations.
        </p>
        <p>
          This section demonstrates using binary encodings for floats and XY-points, and how to build custom encodings.
        </p>
      </div>
      <FloatDemo useUrlState={useUrlState} />
    </>
  )
}
