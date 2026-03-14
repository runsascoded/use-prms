# Spec: Binary URL Parameter Encoding

## Motivation

For applications encoding binary data (floats, coordinates, etc.) in URL params, encoding efficiency matters:
- Shorter shareable URLs
- Better for QR codes, SMS, social media character limits
- Reduced URL bar clutter

## Encoding Comparison

| Encoding | Chars | Bits/char | Relative efficiency |
|----------|-------|-----------|---------------------|
| Decimal strings | 10 (+delims) | ~3.3 | baseline |
| Base64url | 64 | 6.00 | 1.82x |
| Base80 | 80 | 6.32 | 1.92x |
| Theoretical max | ~79-80 | ~6.32 | 1.92x |

### URL-safe characters in hash fragments

Per RFC 3986, these don't need percent-encoding in fragments:
- `A-Z`: 26
- `a-z`: 26
- `0-9`: 10
- `-._~`: 4 (unreserved)
- `!$'()*+,;=`: 10 (sub-delims, minus `&`)
- `:@/?`: 4

**Total: 80 chars** (excluding `&` which delimits params)

Note: `=` is safe inside values if parser splits on first `=` only.

## Real-world impact

For a 3-ellipse diagram (15 floats at medium precision):
- Base64: ~90 chars
- Base80: ~85 chars
- Savings: ~5 chars (5.3%)

For larger payloads (4 shapes, high precision):
- Base64: ~150 chars
- Base80: ~142 chars
- Savings: ~8 chars (5.3%)

## Proposed API

```typescript
import { base64Param, base80Param, binaryParam } from 'use-prms/binary'

// Standard base64url (recommended default)
const shapesParam = base64Param<Shape[]>({
  encode: (shapes) => encodeShapesToBytes(shapes),
  decode: (bytes) => decodeBytesToShapes(bytes),
})

// Maximum density base80
const shapesParam = base80Param<Shape[]>({
  encode: (shapes) => encodeShapesToBytes(shapes),
  decode: (bytes) => decodeBytesToShapes(bytes),
})

// Generic with encoding choice
const shapesParam = binaryParam<Shape[]>({
  encoding: 'base80', // or 'base64'
  encode: (shapes) => encodeShapesToBytes(shapes),
  decode: (bytes) => decodeBytesToShapes(bytes),
})
```

## Base80 Character Set

Proposed 80-char alphabet (excluding `&`):

```
ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$'()*+,;=:@/?
```

Sorted for consistency:
```
!$'()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~
```

## Implementation Notes

### Base80 encode/decode

```typescript
const BASE80_CHARS = "!$'()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~"

function base80Encode(bytes: Uint8Array): string {
  // Convert bytes to big integer, then to base80 digits
  let n = 0n
  for (const byte of bytes) {
    n = (n << 8n) | BigInt(byte)
  }

  if (n === 0n) return BASE80_CHARS[0]

  let result = ''
  while (n > 0n) {
    result = BASE80_CHARS[Number(n % 80n)] + result
    n = n / 80n
  }

  // Preserve leading zero bytes
  for (const byte of bytes) {
    if (byte === 0) result = BASE80_CHARS[0] + result
    else break
  }

  return result
}

function base80Decode(str: string): Uint8Array {
  let n = 0n
  for (const char of str) {
    const idx = BASE80_CHARS.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base80 char: ${char}`)
    n = n * 80n + BigInt(idx)
  }

  // Convert back to bytes
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n = n >> 8n
  }

  // Restore leading zero bytes
  for (const char of str) {
    if (char === BASE80_CHARS[0]) bytes.unshift(0)
    else break
  }

  return new Uint8Array(bytes)
}
```

### Float encoding helpers

Could also provide helpers for common binary encoding patterns:

```typescript
import { floatArrayParam } from 'use-prms/binary'

// Encode array of floats with configurable precision
const coordsParam = floatArrayParam({
  precision: 'float32', // or 'float64', or { expBits: 5, mantBits: 22 }
  encoding: 'base80',
})

const [coords, setCoords] = useUrlParam('c', coordsParam)
```

## When to use

**Use base64url (default):**
- Standard, well-supported
- Easy to debug (can decode with standard tools)
- 95% as efficient as theoretical max

**Use base80:**
- Every character counts (QR codes, SMS)
- Large binary payloads
- Willing to trade debuggability for density

## Related

- [SPEC-LOSSY-MODE.md](./SPEC-LOSSY-MODE.md) - Write-only params for lossy encodings
- apvd's `ShapesBuffer` / `BitBuffer` - Reference implementation of precision-configurable float encoding

## Open Questions

1. Should base80 be the default, or opt-in?
2. Include higher-level helpers (floatArrayParam, etc.) or keep it low-level?
3. Worth supporting custom alphabets for specific use cases?
