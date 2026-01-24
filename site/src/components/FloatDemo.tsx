import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  encodeFloatAllModes,
  encodePointAllModes,
  precisionSchemes,
  floatParam,
  floatToBytes,
  base64Encode,
  pointParam,
  type Point,
  type Param,
} from 'use-prms'

type UseUrlParamHook = <T>(key: string, param: Param<T>, options?: { debounce?: number }) => [T, (v: T) => void]

// Bits per decimal digit (log2(10) ≈ 3.32)
const BITS_PER_DIGIT = Math.log2(10)

type FloatEncoding = 'string' | 'base64'

interface EncodingRowProps {
  label: string
  value: string
  chars: number
  precision?: string
  selected?: boolean
  onSelect?: () => void
}

function EncodingRow({ label, value, chars, precision, selected, onSelect }: EncodingRowProps) {
  return (
    <tr className={selected ? 'selected' : ''} onClick={onSelect} style={{ cursor: onSelect ? 'pointer' : undefined }}>
      <td className="col-encoding encoding-label">
        {onSelect && <input type="radio" checked={selected} onChange={() => {}} style={{ marginRight: '0.5rem' }} />}
        {label}
      </td>
      <td className="col-value encoding-value"><code>{value || '(empty)'}</code></td>
      <td className="col-size encoding-chars">{chars} chars</td>
      {precision !== undefined && <td className="col-precision encoding-bits">{precision}</td>}
    </tr>
  )
}

interface PointGridProps {
  point: Point
  onPointChange: (point: Point) => void
  width?: number
  height?: number
}

function PointGrid({ point, onPointChange, width = 200, height = 200 }: PointGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Map canvas coordinates to point coordinates (-1 to 1 range)
  const canvasToPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1) // Flip Y
    // Round to 6 decimal places to match max encoding precision
    return { x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 }
  }, [])

  // Update on any mouse move (hover)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    onPointChange(canvasToPoint(e))
  }, [canvasToPoint, onPointChange])

  // Draw the grid and point
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Detect dark mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches ||
      document.documentElement.getAttribute('data-theme') === 'dark'

    // Theme colors
    const bgColor = isDark ? '#2a2a2a' : '#f8f8f8'
    const gridColor = isDark ? '#444' : '#e0e0e0'
    const axisColor = isDark ? '#666' : '#999'

    // Clear with background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // Minor grid lines (every 0.25 units = 8 divisions)
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    const divisions = 8
    for (let i = 1; i < divisions; i++) {
      const pos = (i / divisions) * width
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, height)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(width, pos)
      ctx.stroke()
    }

    // Center axes (thicker, darker)
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(width / 2, 0)
    ctx.lineTo(width / 2, height)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    // Point position
    const px = ((point.x + 1) / 2) * width
    const py = ((-point.y + 1) / 2) * height // Flip Y

    // Crosshair lines (dashed, red)
    ctx.strokeStyle = '#e53935'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, height)
    ctx.moveTo(0, py)
    ctx.lineTo(width, py)
    ctx.stroke()
    ctx.setLineDash([])

    // Point circle (red, with outline for visibility)
    ctx.fillStyle = '#e53935'
    ctx.strokeStyle = isDark ? '#222' : '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }, [point, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      style={{
        border: '1px solid var(--border)',
        borderRadius: '4px',
        cursor: 'crosshair',
      }}
    />
  )
}

export interface FloatDemoProps {
  useUrlState: UseUrlParamHook
}

// Available mantissa bit options for the dropdown
const PRECISION_OPTIONS = [16, 22, 28, 34, 40, 46, 52]

export function FloatDemo({ useUrlState }: FloatDemoProps) {
  // ========== BINARY ENCODING SECTION ==========
  const binaryFloatParam = useMemo(() => floatParam(Math.PI), [])
  const [binaryValue, setBinaryValue] = useUrlState('v', binaryFloatParam)

  // Compute encodings for display
  const binaryEncodings = useMemo(() => {
    const base10Full = binaryValue.toString() // Full precision string
    const base64Full = base64Encode(floatToBytes(binaryValue)) // 11 chars
    return { base10: base10Full, base64: base64Full }
  }, [binaryValue])

  // ========== LOSSY SECTION ==========
  // Default: 6 decimals ≈ 20 bits, 22 mantissa bits ≈ 7 digits
  const [decimals, setDecimals] = useState(6)
  const [precision, setPrecision] = useState(22)  // mantissa bits
  const [encoding, setEncoding] = useState<FloatEncoding>('base64')

  // Track if user has interacted with the float section (resets on page refresh)
  const [isDirty, setIsDirty] = useState(false)

  // Create the appropriate param based on selected encoding
  const floatParamDef = useMemo(() => {
    const defaultVal = isDirty ? undefined : Math.PI
    if (encoding === 'string') {
      return floatParam({ encoding: 'string', decimals, default: defaultVal })
    } else {
      return floatParam({ encoding: 'base64', exp: 5, mant: precision, default: defaultVal })
    }
  }, [encoding, decimals, precision, isDirty])

  const [floatValue, setFloatValue] = useUrlState('f', floatParamDef)

  // On mount, force re-encode with exact default values
  useEffect(() => {
    setFloatValue(Math.PI)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetFloatValue = useCallback((v: number) => {
    setIsDirty(true)
    setFloatValue(v)
  }, [setFloatValue])

  const floatValueRef = useRef(floatValue)
  floatValueRef.current = floatValue

  const handleSetEncoding = useCallback((enc: FloatEncoding) => {
    setIsDirty(true)
    setEncoding(enc)
    setTimeout(() => setFloatValue(floatValueRef.current), 0)
  }, [setFloatValue])

  // Calculate encodings for display
  const floatEncodings = useMemo(
    () => encodeFloatAllModes(floatValue, { decimals, precision }),
    [floatValue, decimals, precision]
  )

  const scheme = useMemo(() => ({ expBits: 5, mantBits: precision }), [precision])

  const stringBits = useMemo(() => {
    const intPart = Math.abs(Math.floor(floatValue))
    const intBits = intPart > 0 ? Math.ceil(Math.log2(intPart + 1)) : 0
    const fracBits = Math.round(decimals * BITS_PER_DIGIT)
    return 1 + intBits + fracBits
  }, [floatValue, decimals])

  // ========== POINT SECTION ==========
  const [pointDecimals, setPointDecimals] = useState(4)
  const [pointPrecision, setPointPrecision] = useState(16)
  const [pointEncoding, setPointEncoding] = useState<FloatEncoding>('base64')
  const [pointDebounce, setPointDebounce] = useState(16)

  const defaultPoint = useMemo(() => ({ x: 0.618, y: -0.382 }), [])

  const pointParamDef = useMemo(() => {
    return pointParam({
      encoding: pointEncoding,
      decimals: pointDecimals,
      precision: pointPrecision,
      default: defaultPoint,
    })
  }, [pointEncoding, pointDecimals, pointPrecision, defaultPoint])

  // URL-synced point (debounced writes)
  const [urlPoint, setUrlPoint] = useUrlState('xy', pointParamDef, { debounce: pointDebounce })

  // Local display point (immediate updates)
  const [displayPoint, setDisplayPoint] = useState<Point | null>(null)

  // The point to show: local display takes precedence during interaction
  const point = displayPoint ?? urlPoint

  // Sync local display when URL changes (e.g., on page load or reset)
  useEffect(() => {
    if (urlPoint && !displayPoint) {
      setDisplayPoint(urlPoint)
    }
  }, [urlPoint, displayPoint])

  // Handle point change: update display immediately, URL is debounced
  const handlePointChange = useCallback((newPoint: Point) => {
    setDisplayPoint(newPoint)
    setUrlPoint(newPoint)
  }, [setUrlPoint])

  const handleSetPointEncoding = useCallback((enc: FloatEncoding) => {
    const currentPoint = point || defaultPoint
    setPointEncoding(enc)
    setTimeout(() => {
      setDisplayPoint(currentPoint)
      setUrlPoint(currentPoint)
    }, 0)
  }, [point, setUrlPoint, defaultPoint])

  const handleResetPoint = useCallback(() => {
    setDisplayPoint(defaultPoint)
    setUrlPoint(defaultPoint)
  }, [defaultPoint, setUrlPoint])

  const pointEncodings = useMemo(
    () => point ? encodePointAllModes(point, { decimals: pointDecimals, precision: pointPrecision }) : null,
    [point, pointDecimals, pointPrecision]
  )

  const pointStringBitsPerCoord = useMemo(() => {
    return Math.round(pointDecimals * BITS_PER_DIGIT)
  }, [pointDecimals])

  const pointScheme = useMemo(() => ({ expBits: 5, mantBits: pointPrecision }), [pointPrecision])

  return (
    <div className="float-demo">
      {/* Stage 1: Binary Encoding (compact) */}
      <section id="section-binary" className="section float-section">
        <h2>Binary Encoding</h2>
        <p className="section-intro">
          A 64-bit float stored as binary (8 bytes) encodes to just 11 base64 characters.
          The same value as a decimal string requires 15-17 characters.
        </p>

        <div className="controls">
          <div className="control-group">
            <label>Value</label>
            <input
              type="number"
              step="0.0001"
              value={binaryValue}
              onChange={e => setBinaryValue(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => setBinaryValue(Math.PI)}>π</button>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => setBinaryValue(Math.E)}>e</button>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => setBinaryValue(0.1 + 0.2)}>0.1+0.2</button>
          </div>
        </div>

        <table className="encoding-table">
          <colgroup>
            <col className="col-encoding" />
            <col className="col-value" />
            <col className="col-size" />
          </colgroup>
          <thead>
            <tr>
              <th>Encoding</th>
              <th>Encoded Value</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            <EncodingRow
              label="Base10"
              value={binaryEncodings.base10}
              chars={binaryEncodings.base10.length}
            />
            <EncodingRow
              label="Base64"
              value={binaryEncodings.base64}
              chars={binaryEncodings.base64.length}
            />
          </tbody>
        </table>

        <p className="encoding-note">
          Both preserve full precision—the base64 version decodes to the <em>exact</em> same IEEE 754 bits.
        </p>

        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`import { useUrlState, floatParam } from 'use-prms'

// Full 64-bit precision (8 bytes → 11 base64 chars)
const [value, setValue] = useUrlState('v', floatParam(Math.PI))`}</pre>
        </details>
      </section>

      {/* Stage 2: Approximate/Lossy Encoding */}
      <section id="section-approximate" className="section float-section">
        <h2>Approximate Encoding</h2>
        <p className="section-intro">
          For even shorter URLs, you can trade precision for size. These encodings are <strong>lossy</strong>:
          the decoded value is an approximation, so refreshing the page may not reproduce the exact original value.
        </p>

        <div className="controls">
          <div className="control-group">
            <label>Value</label>
            <input
              type="number"
              step="0.0001"
              value={floatValue}
              onChange={e => handleSetFloatValue(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="control-group">
            <label>String decimals</label>
            <select value={decimals} onChange={e => setDecimals(parseInt(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(d => (
                <option key={d} value={d}>{d} (~{Math.round(d * BITS_PER_DIGIT)} bits)</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Binary precision</label>
            <select value={precision} onChange={e => setPrecision(parseInt(e.target.value))}>
              {PRECISION_OPTIONS.map(bits => (
                <option key={bits} value={bits}>
                  {bits} bits (~{Math.floor(bits * Math.log10(2))} digits)
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => handleSetFloatValue(Math.PI)}>π</button>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => handleSetFloatValue(Math.E)}>e</button>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => handleSetFloatValue(0.1 + 0.2)}>0.1+0.2</button>
          </div>
        </div>

        <table className="encoding-table">
          <thead>
            <tr>
              <th className="col-encoding">Encoding</th>
              <th className="col-value">Encoded Value</th>
              <th className="col-size">Size</th>
              <th className="col-precision">Precision</th>
            </tr>
          </thead>
          <tbody>
            <EncodingRow
              label="Base10"
              value={floatEncodings.string}
              chars={floatEncodings.string.length}
              precision={`~${stringBits} bits`}
              selected={encoding === 'string'}
              onSelect={() => handleSetEncoding('string')}
            />
            <EncodingRow
              label="Base64"
              value={floatEncodings.base64}
              chars={floatEncodings.base64.length}
              precision={`~${floatEncodings.bits} bits`}
              selected={encoding === 'base64'}
              onSelect={() => handleSetEncoding('base64')}
            />
          </tbody>
        </table>

        <div className="encoding-note">
          <strong>Base10:</strong> ~{stringBits} bits ({decimals} decimals × 3.32 bits/digit + integer part)
          <br />
          <strong>Binary:</strong> {scheme.expBits} exp + 1 sign + {scheme.mantBits} mantissa = {floatEncodings.bits} bits
        </div>

        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`import { useUrlState, floatParam } from 'use-prms'

// Base10 string truncation (lossy)
const [f, setF] = useUrlState('f', floatParam({ encoding: 'string', decimals: ${decimals} }))

// Base64 binary encoding (lossy, but more compact)
const [f, setF] = useUrlState('f', floatParam({ encoding: 'base64', exp: 5, mant: ${precision} }))`}</pre>
        </details>

        <details className="precision-reference">
          <summary>Precision Schemes Reference</summary>
          <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Predefined schemes balance accuracy vs. URL size.
          </p>
          <table className="encoding-table precision-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mantissa</th>
                <th>~Digits</th>
                <th>Float</th>
                <th>Point</th>
                <th>Use Case</th>
              </tr>
            </thead>
            <tbody>
              {precisionSchemes.map((s, i) => {
                const floatBits = s.expBits + 1 + s.mantBits
                const pointBits = s.expBits + 2 * (1 + s.mantBits)
                const digits = Math.floor(s.mantBits * Math.log10(2))
                const useCase = i === 0 ? 'Minimal' :
                                i === 1 ? 'Default' :
                                i === 2 ? 'Good balance' :
                                i === 3 ? 'High precision' :
                                i === 4 ? 'Very high' :
                                i === 5 ? 'Near double' :
                                'Full double'
                return (
                  <tr key={i} className={s.mantBits === precision ? 'selected' : ''}>
                    <td>{i}</td>
                    <td>{s.mantBits}</td>
                    <td>~{digits}</td>
                    <td>{floatBits}b / {Math.ceil(floatBits / 6)}ch</td>
                    <td>{pointBits}b / {Math.ceil(pointBits / 6)}ch</td>
                    <td>{useCase}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </details>
      </section>

      {/* Interactive Point Grid */}
      <section id="section-point" className="section float-section">
        <h2>Point Encoding</h2>
        <p className="section-intro">
          Points (x, y pairs) can share exponent bits for even more compact encoding.
          Hover over the grid to see the URL update in real-time.
        </p>

        <div className="controls" style={{ marginBottom: '1rem' }}>
          <div className="point-grid-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
            <PointGrid
              point={point || defaultPoint}
              onPointChange={handlePointChange}
            />
            <div className="point-coords" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.9rem' }}>
              ({point?.x.toFixed(3) || '0.000'}, {point?.y.toFixed(3) || '0.000'})
            </div>
          </div>
          <div className="control-group">
            <label>Base10 decimals</label>
            <select value={pointDecimals} onChange={e => setPointDecimals(parseInt(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Binary precision</label>
            <select value={pointPrecision} onChange={e => setPointPrecision(parseInt(e.target.value))}>
              {PRECISION_OPTIONS.map(bits => (
                <option key={bits} value={bits}>
                  {bits} bits
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Debounce</label>
            <select value={pointDebounce} onChange={e => setPointDebounce(parseInt(e.target.value))}>
              {[0, 16, 50, 100, 200, 500].map(ms => (
                <option key={ms} value={ms}>{ms === 0 ? 'None' : `${ms}ms`}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={handleResetPoint}>Reset</button>
          </div>
        </div>

        {pointEncodings && (
          <table className="encoding-table">
            <thead>
              <tr>
                <th className="col-encoding">Encoding</th>
                <th className="col-value">Encoded Value</th>
                <th className="col-size">Size</th>
                <th className="col-precision">Bits/coord</th>
              </tr>
            </thead>
            <tbody>
              <EncodingRow
                label="Base10"
                value={pointEncodings.string}
                chars={pointEncodings.string.length}
                precision={`~${pointStringBitsPerCoord}`}
                selected={pointEncoding === 'string'}
                onSelect={() => handleSetPointEncoding('string')}
              />
              <EncodingRow
                label="Base64"
                value={pointEncodings.base64}
                chars={pointEncodings.base64.length}
                precision={`${pointScheme.mantBits}`}
                selected={pointEncoding === 'base64'}
                onSelect={() => handleSetPointEncoding('base64')}
              />
            </tbody>
          </table>
        )}

        <details className="code-sample">
          <summary>Code</summary>
          <pre>{`import { useUrlState, pointParam } from 'use-prms'

const [point, setPoint] = useUrlState(
  'xy',
  pointParam({
    encoding: '${pointEncoding}',
${pointEncoding === 'base64'
  ? `    precision: ${pointPrecision},  // mantissa bits per coordinate`
  : `    decimals: ${pointDecimals},`}
  }),
  { debounce: ${pointDebounce} }
)`}</pre>
        </details>
      </section>

      {/* BitBuffer Reference */}
      <section className="section float-section">
        <h2>Custom Binary Encodings</h2>
        <p className="section-intro">
          Need to encode something other than floats? <code>BitBuffer</code> lets you pack arbitrary data into URL-safe base64 strings.
          The approximate float encodings above are built on this foundation.
        </p>

        <details className="code-sample" open>
          <summary>BitBuffer Example</summary>
          <pre>{`import { BitBuffer } from 'use-prms'

// Pack arbitrary data into bits
const buf = new BitBuffer()
buf.encodeInt(shapeType, 3)     // 3 bits for enum (0-7)
buf.encodeInt(colorIndex, 4)   // 4 bits for color (0-15)
buf.encodeBigInt(timestamp, 42) // 42 bits for timestamp
const urlParam = buf.toBase64()

// Unpack on decode
const buf = BitBuffer.fromBase64(urlParam)
const shapeType = buf.decodeInt(3)
const colorIndex = buf.decodeInt(4)
const timestamp = buf.decodeBigInt(42)`}</pre>
        </details>

        <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          <a href="https://github.com/runsascoded/use-prms/blob/main/src/float.ts" target="_blank" rel="noopener noreferrer">
            View BitBuffer implementation →
          </a>
        </p>
      </section>

    </div>
  )
}
