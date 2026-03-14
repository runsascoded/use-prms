# Add `optFloatParam`: nullable float URL parameter

## Motivation

`optIntParam` already exists (`Param<number | null>`, absent → `null`), but there's no float equivalent. `floatParam` always maps absent → a default number, which makes it impossible to distinguish "not specified" from "explicitly set to the default value."

Concrete use case: ELvis uses `useUrlState('iso', floatParam(...))` for iso-level. When navigating to a URL with `?iso=571.4`, the app loads data and then unconditionally overwrites it with a computed default — because `floatParam` can't express "this wasn't in the URL." A nullable param (`null` = absent) lets the app check `if (isoLevel === null) setIsoLevel(computed)`.

## API

```typescript
optFloatParam()                                          // lossless base64
optFloatParam({ encoding: 'string' })                    // full precision toString()
optFloatParam({ encoding: 'string', decimals: 1 })       // 1 decimal place
optFloatParam({ encoding: 'base64', precision: '5+22' }) // lossy base64
optFloatParam({ encoding: 'base64', exp: 5, mant: 22 })  // same, explicit
```

Type: `Param<number | null>`

Options type: `Omit<FloatParamOptions, 'default'>` — same encoding options as `floatParam`, but no `default` (absent always means `null`).

### Semantics

| Value | `encode` | `decode` |
|-------|----------|----------|
| `null` | `undefined` (absent from URL) | — |
| any `number` | encoded string (never `undefined`) | — |
| — | — | `undefined` or `''` → `null` |
| — | — | valid string → parsed `number` |
| — | — | invalid string → `null` |

Key difference from `floatParam`: `encode(0)` returns `"0"` (or `"0.0"`, etc.), not `undefined`. There's no default-skip — only `null` removes the param.

## Implementation

### Refactor: extract format/parse helpers

The four internal factories in `float.ts` each have the same structure:

```typescript
function createXxxParam(defaultValue: number, ...): Param<number> {
  return {
    encode: (value) => {
      if (value === defaultValue) return undefined   // ← default-skip
      return formatXxx(value)                         // ← encoding logic
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultValue  // ← default-fill
      return parseXxx(encoded) ?? defaultValue                         // ← decoding logic
    },
  }
}
```

Extract the format/parse logic into shared helpers:

```typescript
// String encoding helpers
function formatFloat(value: number): string {
  return value.toString()
}

function formatTruncatedFloat(value: number, decimals: number, multiplier: number): string {
  const truncated = Math.round(value * multiplier) / multiplier
  return truncated.toFixed(decimals)
}

function parseFloatSafe(encoded: string): number | null {
  const parsed = parseFloat(encoded)
  return isNaN(parsed) ? null : parsed
}

// Base64 encoding helpers
function encodeLosslessBase64(value: number, opts?: Base64Options): string {
  return base64Encode(floatToBytes(value), opts)
}

function decodeLosslessBase64(encoded: string, opts?: Base64Options): number | null {
  try {
    return bytesToFloat(base64Decode(encoded, opts))
  } catch {
    return null
  }
}

function encodeLossyBase64(value: number, scheme: PrecisionScheme, opts?: Base64Options): string {
  const buf = new BitBuffer()
  buf.encodeFixedPoints([value], scheme)
  return buf.toBase64(opts)
}

function decodeLossyBase64(encoded: string, scheme: PrecisionScheme, opts?: Base64Options): number | null {
  try {
    const buf = BitBuffer.fromBase64(encoded, opts)
    const [value] = buf.decodeFixedPoints(1, scheme)
    return value
  } catch {
    return null
  }
}
```

Then both `floatParam` and `optFloatParam` use these. The existing factories become:

```typescript
function createFullStringParam(defaultValue: number): Param<number> {
  return {
    encode: (value) => value === defaultValue ? undefined : formatFloat(value),
    decode: (encoded) => (encoded === undefined || encoded === '') ? defaultValue : (parseFloatSafe(encoded) ?? defaultValue),
  }
}
```

### `optFloatParam` function

```typescript
export function optFloatParam(opts: Omit<FloatParamOptions, 'default'> = {}): Param<number | null> {
  const { encoding = 'base64', decimals, exp, mant, precision, alphabet } = opts

  // Same validation as floatParam (omitted for brevity)

  if (encoding === 'string') {
    if (decimals !== undefined) {
      const multiplier = Math.pow(10, decimals)
      return {
        encode: (v) => v === null ? undefined : formatTruncatedFloat(v, decimals, multiplier),
        decode: (e) => (e === undefined || e === '') ? null : parseFloatSafe(e),
      }
    }
    return {
      encode: (v) => v === null ? undefined : formatFloat(v),
      decode: (e) => (e === undefined || e === '') ? null : parseFloatSafe(e),
    }
  }

  // Base64 encoding
  const base64Opts = alphabet ? { alphabet } : undefined

  if (exp !== undefined && mant !== undefined) {
    const scheme = { expBits: exp, mantBits: mant }
    return {
      encode: (v) => v === null ? undefined : encodeLossyBase64(v, scheme, base64Opts),
      decode: (e) => (e === undefined || e === '') ? null : decodeLossyBase64(e, scheme, base64Opts),
    }
  }

  if (precision !== undefined) {
    const { exp: e, mant: m } = parsePrecisionString(precision)
    const scheme = { expBits: e, mantBits: m }
    return {
      encode: (v) => v === null ? undefined : encodeLossyBase64(v, scheme, base64Opts),
      decode: (e) => (e === undefined || e === '') ? null : decodeLossyBase64(e, scheme, base64Opts),
    }
  }

  // Lossless base64 (default)
  return {
    encode: (v) => v === null ? undefined : encodeLosslessBase64(v, base64Opts),
    decode: (e) => (e === undefined || e === '') ? null : decodeLosslessBase64(e, base64Opts),
  }
}
```

## Tests

Add to `float.test.ts`, mirroring existing `floatParam` tests:

```typescript
describe('optFloatParam', () => {
  describe('string encoding', () => {
    const p = optFloatParam({ encoding: 'string', decimals: 2 })

    test('encode null → undefined', () => {
      expect(p.encode(null)).toBeUndefined()
    })
    test('encode 0 → "0.00" (not undefined)', () => {
      expect(p.encode(0)).toBe('0.00')
    })
    test('encode 3.14159 → "3.14"', () => {
      expect(p.encode(3.14159)).toBe('3.14')
    })
    test('decode undefined → null', () => {
      expect(p.decode(undefined)).toBeNull()
    })
    test('decode "" → null', () => {
      expect(p.decode('')).toBeNull()
    })
    test('decode "3.14" → 3.14', () => {
      expect(p.decode('3.14')).toBe(3.14)
    })
    test('decode "garbage" → null', () => {
      expect(p.decode('garbage')).toBeNull()
    })
  })

  describe('lossless base64', () => {
    const p = optFloatParam()

    test('encode null → undefined', () => {
      expect(p.encode(null)).toBeUndefined()
    })
    test('encode 0 → 11-char string (not undefined)', () => {
      const encoded = p.encode(0)
      expect(encoded).toBeDefined()
      expect(encoded).toHaveLength(11)
    })
    test('round-trip', () => {
      expect(p.decode(p.encode(3.14159)!)).toBe(3.14159)
    })
    test('decode undefined → null', () => {
      expect(p.decode(undefined)).toBeNull()
    })
  })

  describe('full precision string', () => {
    const p = optFloatParam({ encoding: 'string' })

    test('encode 0 → "0" (not undefined)', () => {
      expect(p.encode(0)).toBe('0')
    })
    test('round-trip', () => {
      expect(p.decode(p.encode(3.14159)!)).toBe(3.14159)
    })
  })
})
```

## Downstream change

Once published, ELvis replaces the local `optFloat1Param` with:

```typescript
import { optFloatParam } from 'use-prms'

const [isoLevel, setIsoLevel] = useDebouncedUrlState('iso', optFloatParam({ encoding: 'string', decimals: 1 }), 300)
```
