# use-prms

[![npm version](https://img.shields.io/npm/v/use-prms)](https://www.npmjs.com/package/use-prms)
[![license](https://img.shields.io/npm/l/use-prms)](https://github.com/runsascoded/use-prms/blob/main/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/use-prms)](https://bundlephobia.com/package/use-prms)

Type-safe URL-parameter (query and hash) management with minimal, human-readable encoding and decoding.

<!-- `toc` -->
- [Features](#features)
- [Installation](#install)
- [Quick Start](#quick-start)
- [Built-in Param Types](#param-types)
- [Custom Params](#custom)
- [Batch Updates](#batch)
- [URL Encoding](#encoding)
- [Binary Encoding](#binary)
- [Map / Tuple Params](#tuple)
- [URL Diagnostics](#diagnostics)
- [Framework-Agnostic Core](#core)
- [Hash Params](#hash)
- [API Reference](#api)
- [Examples](#examples)
- [Reverse Inspo](#reverse-inspo)
- [License](#license)

## Features <a id="features"></a>

- 🎯 **Type-safe**: Full TypeScript support with generic `Param<T>` interface
- 📦 **Tiny URLs**: Smart encoding - omit defaults, use short keys, `+` for spaces
- ⚛️ **React hooks**: `useUrlState()` and `useUrlStates()` for seamless integration
- 🔧 **Framework-agnostic**: Core utilities work anywhere, React hooks are optional
- 🌳 **Tree-shakeable**: ESM + CJS builds with TypeScript declarations
- 0️⃣ **Zero dependencies**: Except React (peer dependency, optional)
- 🔁 **Multi-value params**: Support for repeated keys like `?tag=a&tag=b`
- #️⃣ **Hash params**: Use hash fragment (`#key=value`) instead of query string

## Installation <a id="install"></a>

```bash
npm install use-prms
```
Or:
```bash
pnpm add use-prms
```

## Quick Start <a id="quick-start"></a>

```typescript
import { useUrlState, boolParam, stringParam, intParam } from 'use-prms'

function MyComponent() {
  const [zoom, setZoom] = useUrlState('z', boolParam)
  const [device, setDevice] = useUrlState('d', stringParam())
  const [count, setCount] = useUrlState('n', intParam(10))

  // URL: ?z&d=gym&n=5
  // zoom = true, device = "gym", count = 5

  return (
    <div>
      <button onClick={() => setZoom(!zoom)}>Toggle Zoom</button>
      <input value={device ?? ''} onChange={e => setDevice(e.target.value)} />
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  )
}
```

## Built-in Param Types <a id="param-types"></a>

### Boolean
```typescript
const [enabled, setEnabled] = useUrlState('e', boolParam)
// ?e → true
// (absent) → false
```

### Strings
```typescript
const [name, setName] = useUrlState('n', stringParam())           // optional
const [mode, setMode] = useUrlState('m', defStringParam('auto'))  // with default
// ?n=foo → "foo"
// (absent) → undefined / "auto"
```

### Numbers
```typescript
const [count, setCount] = useUrlState('c', intParam(0))
const [ratio, setRatio] = useUrlState('r', floatParam(1.0))
const [id, setId] = useUrlState('id', optIntParam)           // number | null
const [iso, setIso] = useUrlState('iso', optFloatParam())    // number | null
// ?c=5&r=1.5&id=123&iso=<base64> → 5, 1.5, 123, 0.75
// (absent) → 0, 1.0, null, null
```

### Enums
```typescript
const [theme, setTheme] = useUrlState(
  't',
  enumParam('light', ['light', 'dark', 'auto'] as const)
)
// ?t=dark → "dark"
// ?t=invalid → "light" (warns in console)
```

### Arrays (delimiter-separated)
```typescript
const [tags, setTags] = useUrlState('tags', stringsParam([], ','))
const [ids, setIds] = useUrlState('ids', numberArrayParam([]))
// ?tags=foo,bar,baz → ["foo", "bar", "baz"]
// ?ids=1,2,3 → [1, 2, 3]
```

### Multi-value Arrays (repeated keys)
```typescript
import { useMultiUrlState, multiStringParam, multiIntParam } from 'use-prms'

const [tags, setTags] = useMultiUrlState('tag', multiStringParam())
// ?tag=foo&tag=bar&tag=baz → ["foo", "bar", "baz"]

const [ids, setIds] = useMultiUrlState('id', multiIntParam())
// ?id=1&id=2&id=3 → [1, 2, 3]

// Also available: multiFloatParam()
```

### Compact Code Mapping
```typescript
// Single value with short codes
const [metric, setMetric] = useUrlState('y', codeParam('Rides', {
  Rides: 'r',
  Minutes: 'm',
}))
// ?y=m → "Minutes", omitted for default "Rides"

// Multi-value with short codes (omits when all selected)
const [regions, setRegions] = useUrlState('r', codesParam(
  ['NYC', 'JC', 'HOB'],
  { NYC: 'n', JC: 'j', HOB: 'h' }
))
// ?r=nj → ["NYC", "JC"], omitted when all three selected
```

### Pagination
```typescript
const [page, setPage] = useUrlState('p', paginationParam(20))
// Encodes offset + pageSize compactly using + as delimiter:
// { offset: 0, pageSize: 20 } → (omitted)
// { offset: 0, pageSize: 50 } → ?p=+50
// { offset: 100, pageSize: 20 } → ?p=100
// { offset: 100, pageSize: 50 } → ?p=100+50
```

## Custom Params <a id="custom"></a>

Create your own param encoders/decoders:

```typescript
import type { Param } from 'use-prms'

// Example: Compact date encoding (YYMMDD)
const dateParam: Param<Date> = {
  encode: (date) => {
    const yy = String(date.getFullYear()).slice(-2)
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yy}${mm}${dd}`
  },
  decode: (str) => {
    if (!str || str.length !== 6) return new Date()
    const yy = parseInt('20' + str.slice(0, 2), 10)
    const mm = parseInt(str.slice(2, 4), 10) - 1
    const dd = parseInt(str.slice(4, 6), 10)
    return new Date(yy, mm, dd)
  }
}

const [date, setDate] = useUrlState('d', dateParam)
// ?d=251123 → Date(2025, 10, 23)
```

## Batch Updates <a id="batch"></a>

Use `useUrlStates()` to update multiple parameters atomically:

```typescript
import { useUrlStates, intParam, boolParam } from 'use-prms'

const { values, setValues } = useUrlStates({
  page: intParam(1),
  size: intParam(20),
  grid: boolParam
})

// Update multiple params at once (single history entry)
setValues({ page: 2, size: 50 })
```

## URL Encoding <a id="encoding"></a>

- **Spaces**: Encoded as `+` (standard form-urlencoded)
- **Defaults**: Omitted from URL (keeps URLs minimal)
- **Booleans**: Present = true (`?z`), absent = false
- **Empty values**: Valueless params (`?key` without `=`)

Example:
```typescript
const [devices, setDevices] = useUrlState('d', stringsParam([], ' '))
setDevices(['gym', 'bedroom'])
// URL: ?d=gym+bedroom
```

## Binary Encoding <a id="binary"></a>

For complex data that doesn't fit well into string encoding, `use-prms` provides binary encoding utilities with URL-safe base64.

### BitBuffer

Low-level bit packing for custom binary formats:

```typescript
import { BitBuffer } from 'use-prms'

// Encoding
const buf = new BitBuffer()
buf.encodeInt(myEnum, 3)      // 3 bits for enum (0-7)
buf.encodeInt(myCount, 8)     // 8 bits for count (0-255)
buf.encodeBigInt(myId, 48)    // 48 bits for ID
const urlParam = buf.toBase64()

// Decoding
const buf = BitBuffer.fromBase64(urlParam)
const myEnum = buf.decodeInt(3)
const myCount = buf.decodeInt(8)
const myId = buf.decodeBigInt(48)
```

### Float Params

Encode floats compactly as base64:

```typescript
import { floatParam, optFloatParam } from 'use-prms'

// Lossless (11 chars, exact IEEE 754)
const [zoom, setZoom] = useUrlState('z', floatParam(1.0))

// Lossy (fewer chars, configurable precision)
const [lat, setLat] = useUrlState('lat', floatParam({
  default: 0,
  exp: 5,      // exponent bits
  mant: 22,    // mantissa bits (~7 decimal digits)
}))

// Optional (null when absent, like optIntParam)
const [iso, setIso] = useUrlState('iso', optFloatParam())
const [level, setLevel] = useUrlState('lv', optFloatParam({
  encoding: 'string', decimals: 2,
}))
```

### Point Params

Encode 2D points compactly:

```typescript
import { pointParam } from 'use-prms'

// String encoding (human-readable)
const [pos, setPos] = useUrlState('p', pointParam({ encoding: 'string', decimals: 2 }))
// ?p=1.23+5.68 → { x: 1.23, y: 5.68 }

// Binary encoding (more compact, default)
const [pos, setPos] = useUrlState('p', pointParam({ precision: 22 }))
// ?p=<base64> → { x: 1.234, y: 5.678 }
```

### Custom Alphabets

Choose between standard base64url or ASCII-sorted alphabet:

```typescript
import { ALPHABETS, binaryParam, floatParam } from 'use-prms'

// Standard RFC 4648 (default)
// ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_

// ASCII-sorted (lexicographic sort = numeric sort)
// -0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz

const param = floatParam({ default: 0, alphabet: 'sortable' })
```

The `sortable` alphabet is useful when encoded strings need to sort in the same order as their numeric values (e.g., for database indexing).

## Map / Tuple Params <a id="tuple"></a>

For URL params that pack multiple numbers into a single value (lat/lng/zoom, bounding boxes, camera state, …), use `numberTupleParam` or one of the named wrappers built on top of it.

### `numberTupleParam`

A general-purpose primitive: declares a heterogeneous tuple of numbers (each with its own encoding — `decimals`, `sigfigs`, or `int`) at typed paths within a shape `T`. The path type `NumberPath<T>` is recursive, so dotted paths like `'sw.lat'` autocomplete and reject non-number leaves.

```typescript
import { numberTupleParam } from 'use-prms'

type Camera = { lat: number; lng: number; zoom: number; pitch: number }

const cam = numberTupleParam<Camera>({
  default: { lat: 0, lng: 0, zoom: 0, pitch: 0 },
  fields: [
    { path: 'lat',   decimals: 4 },
    { path: 'lng',   decimals: 4 },
    { path: 'zoom',  decimals: 2 },
    { path: 'pitch', int: true },
  ],
})
// ?cam=40.7400-74.0120+11.80+45  (signDelim default; ` ` URL-encodes to `+`)
```

`fields[i]` accepts exactly one of `decimals`, `sigfigs`, or `int`. Nested shapes work via dotted paths:

```typescript
type BBox = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }

const bb = numberTupleParam<BBox>({
  default: { sw: { lat: 0, lng: 0 }, ne: { lat: 0, lng: 0 } },
  fields: [
    { path: 'sw.lat', decimals: 4 },
    { path: 'sw.lng', decimals: 4 },
    { path: 'ne.lat', decimals: 4 },
    { path: 'ne.lng', decimals: 4 },
  ],
})
```

### `signDelim` and auto-migration

By default, `numberTupleParam` (and the named wrappers below) use a "sign-as-delimiter" encoding: a space (URL-encodes to `+`) between non-negative numbers, no delimiter before negative numbers (the `-` itself separates). This reads naturally for signed coordinates.

```
{ lat: 40.74, lng: -74.01, zoom: 11.8 }
→  '40.7400-74.0100 11.80'   (literal: `40.7400-74.0100+11.80` in URL)
```

The decoder splits on any non-numeric char (`[ +\-_,]` etc.), so URLs in older delimited formats (e.g. `40.7400_-74.0100_11.80`) parse correctly. On the next state change, encode emits the new format — auto-migrating bookmarks in place. Pass `signDelim: false` to opt out and use a strict `delimiter` (default `'_'`).

### Named wrappers

Three thin shells over `numberTupleParam` for the common map-state cases:

```typescript
import { llzParam, bboxParam, viewStateParam } from 'use-prms'

// Lat/lng/zoom (+ optional pitch/bearing)
const view = llzParam({
  default: { lat: 40.74, lng: -74.012, zoom: 11.8 },
  // latLngDecimals, zoomDecimals, pitchDecimals, bearingDecimals are individually configurable
})
// ?ll=40.7400-74.0120+11.80

// Bounding box (sw/ne corners)
const bb = bboxParam({
  default: { sw: { lat: 40.7, lng: -74.1 }, ne: { lat: 40.8, lng: -74.0 } },
})

// deck.gl-style ViewState; supports `default: null` for "no override / use auto-fit"
const vs = viewStateParam({ default: null, pitchFallback: 45 })
```

All three accept `signDelim`, `delimiter`, and per-field decimal options.

## URL Diagnostics <a id="diagnostics"></a>

`use-prms` can report on the relationship between the URL and your declared param spec — which keys are unrecognized, which values are malformed (decoded to default), and which are stale (parsed but in non-canonical format). Reporting and cleanup are decoupled: you can observe without acting, act without observing, or both.

### Pure helpers (framework-agnostic)

```typescript
import { classifyParam, inspectUrl, cleanUrl, intParam, llzParam } from 'use-prms'

// Classify a single value
classifyParam(intParam(0), '5')        // { state: 'canonical', raw: '5' }
classifyParam(intParam(0), 'garbage')  // { state: 'malformed', raw: 'garbage', canonical: undefined }

const ll = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
classifyParam(ll, '40.76_-73.98_13.00')
//   → { state: 'stale', raw: '40.76_-73.98_13.00', canonical: '40.7600-73.9800 13.00' }

// Inspect the full URL — pure, no side effects
inspectUrl({ ll, n: intParam(0) })
//   → { unrecognized: ['legacy'], malformed: [{ key: 'n', raw: 'garbage', ... }], stale: [...] }

// Apply a cleanup policy in place (history.replaceState)
cleanUrl({ ll, n: intParam(0) }, {
  unrecognized: 'strip',     // default 'keep'
  malformed:    'reset',     // default 'keep'
  stale:        'normalize', // default 'keep'
})
```

`cleanUrl` returns the diagnostics it observed, so you can log/notify based on what was acted on.

### React integration

`useUrlState` returns a 3-tuple now (the 3rd element is additive — existing 2-element destructuring still works):

```typescript
const [view, setView, diag] = useUrlState('ll', llzParam({ default: ... }))
// diag: { state: 'absent' | 'canonical' | 'stale' | 'malformed', raw?, canonical? }

// Or fire-and-forget via callback:
useUrlState('ll', llz, {
  onDiagnostic: (d) => { if (d.state === 'malformed') toast.warn('bad URL') },
})
```

`useUrlStates` adds a `diagnostics` field plus two new options:

```typescript
const { values, setValues, diagnostics } = useUrlStates(
  { ll: llzParam(...), bb: bboxParam(...) },
  {
    // Fire whenever the URL changes
    onDiagnostics: (d) => console.log(d),

    // Auto-clean once on mount (orthogonal to onDiagnostics)
    cleanOnMount: { unrecognized: 'strip', stale: 'normalize' },
  },
)
```

The malformed/stale split is heuristic: a URL that legitimately encodes the *default* value in a legacy format gets reported as `malformed` (a benign false-positive — `cleanUrl` produces the correct outcome either way, since the value is the default).

## Framework-Agnostic Core <a id="core"></a>

Use the core utilities without React:

```typescript
import { boolParam, serializeMultiParams, parseMultiParams } from 'use-prms'

// Encode
const params = { z: [boolParam.encode(true) ?? ''], d: ['gym'] }
const search = serializeMultiParams(params)  // "z&d=gym"

// Decode
const parsed = parseMultiParams(window.location.search)
const zoom = boolParam.decode(parsed.z?.[0])  // true
```

## Hash Params <a id="hash"></a>

Use hash fragment (`#key=value`) instead of query string (`?key=value`):

```typescript
// Just change the import path
import { useUrlState, boolParam } from 'use-prms/hash'

const [zoom, setZoom] = useUrlState('z', boolParam)
// URL: https://example.com/#z (instead of ?z)
```

Same API, different URL location. Useful when query strings conflict with server routing or you want params to survive page reloads without server involvement.

## API Reference <a id="api"></a>

### `useUrlState<T>(key, param, options?)`

React hook for managing a single URL parameter.

- `key`: Query parameter key
- `param`: Param encoder/decoder
- `options`: `UseUrlStateOptions | boolean` (boolean is legacy shorthand for `push`)
  - `push?`: Use pushState (true) or replaceState (false, default)
  - `debounce?`: Debounce URL writes in ms (state updates immediately)
  - `onDiagnostic?`: Callback fired with a `ParamDiagnostic` whenever the URL value changes shape (state + raw)
- Returns: `[value: T, setValue: (value: T) => void, diagnostic: ParamDiagnostic]`

### `useUrlStates<P>(params, options?)`

React hook for managing multiple URL parameters together.

- `params`: Object mapping keys to Param types
- `options`: `UseUrlStatesOptions | boolean`
  - All `useUrlState` options except `onDiagnostic`
  - `onDiagnostics?`: Callback fired with a `UrlDiagnostics` whenever the URL changes shape
  - `cleanOnMount?`: `CleanUrlPolicy` — runs `cleanUrl(params, policy)` once on mount
- Returns: `{ values, setValues, diagnostics: UrlDiagnostics }`

### `useMultiUrlState<T>(key, param, options?)`

React hook for managing a multi-value URL parameter (repeated keys).

- `key`: Query parameter key
- `param`: MultiParam encoder/decoder
- `options`: Same as `useUrlState`
- Returns: `[value: T, setValue: (value: T) => void]`

### `useMultiUrlStates<P>(params, options?)`

React hook for managing multiple multi-value URL parameters together.

- `params`: Object mapping keys to MultiParam types
- `options`: Same as `useUrlState`
- Returns: `{ values, setValues }`

### `Param<T>`

Bidirectional encoder/decoder interface:

```typescript
type Param<T> = {
  encode: (value: T) => string | undefined
  decode: (encoded: string | undefined) => T
}
```

### `MultiParam<T>`

Multi-value encoder/decoder interface:

```typescript
type MultiParam<T> = {
  encode: (value: T) => string[]
  decode: (encoded: string[]) => T
}
```

### Built-in Param Types

| Param | Type | Description |
|-------|------|-------------|
| `boolParam` | `Param<boolean>` | `?key` = true, absent = false |
| `stringParam(init?)` | `Param<string \| undefined>` | Optional string |
| `defStringParam(init)` | `Param<string>` | Required string with default |
| `intParam(init)` | `Param<number>` | Integer with default |
| `floatParam(init)` | `Param<number>` | Float with default |
| `optIntParam` | `Param<number \| null>` | Optional integer |
| `optFloatParam(opts?)` | `Param<number \| null>` | Optional float (all `floatParam` encodings) |
| `enumParam(init, values)` | `Param<T>` | Validated enum |
| `stringsParam(init?, delim?)` | `Param<string[]>` | Delimiter-separated strings |
| `numberArrayParam(init?)` | `Param<number[]>` | Comma-separated numbers |
| `codeParam(init, codeMap)` | `Param<T>` | Enum with short URL codes |
| `codesParam(allValues, codeMap, sep?)` | `Param<T[]>` | Multi-value with short codes |
| `paginationParam(defaultSize, validSizes?)` | `Param<Pagination>` | Offset + page size |
| `numberTupleParam<T>(opts)` | `Param<T>` | Heterogeneous number tuple (typed dotted paths, decimals/sigfigs/int per field, signDelim) |
| `llzParam(opts)` | `Param<LLZ>` | Lat/lng/zoom (+ optional pitch/bearing) |
| `bboxParam(opts)` | `Param<BBox>` | Bounding box (`sw`/`ne` corners) |
| `viewStateParam(opts)` | `Param<ViewState \| null>` | deck.gl camera state; nullable default for "no override" |

### Built-in MultiParam Types

| Param | Type | Description |
|-------|------|-------------|
| `multiStringParam(init?)` | `MultiParam<string[]>` | Repeated string params |
| `multiIntParam(init?)` | `MultiParam<number[]>` | Repeated integer params |
| `multiFloatParam(init?)` | `MultiParam<number[]>` | Repeated float params |

### Binary Encoding

| Export | Description |
|--------|-------------|
| `BitBuffer` | Bit-level buffer for packing/unpacking arbitrary bit widths |
| `floatParam(opts)` | Float with configurable encoding (string or base64) and precision |
| `optFloatParam(opts?)` | Optional float (`null` when absent); same encoding options as `floatParam` |
| `pointParam(opts?)` | 2D point (`{ x, y }`) with string or packed binary encoding |
| `binaryParam(opts)` | Create param from `toBytes`/`fromBytes` converters |
| `base64Param(toBytes, fromBytes)` | Shorthand for `binaryParam` |
| `base64Encode(bytes, opts?)` | Encode `Uint8Array` to base64 string |
| `base64Decode(str, opts?)` | Decode base64 string to `Uint8Array` |
| `ALPHABETS` | Preset alphabets: `rfc4648` (default), `sortable` (ASCII-ordered) |

### Core Utilities

- `serializeParams(params)`: Convert params object to URL query string *(deprecated, use `serializeMultiParams`)*
- `parseParams(source)`: Parse URL string or URLSearchParams to object *(deprecated, use `parseMultiParams`)*
- `serializeMultiParams(params)`: Convert multi-value params to URL query string
- `parseMultiParams(source)`: Parse URL to multi-value params object
- `getCurrentParams()`: Get current URL params (browser only)
- `updateUrl(params, push?)`: Update URL without reloading (browser only)
- `clearParams(strategy?)`: Clear all URL params (`'query'` or `'hash'`)
- `notifyLocationChange()`: Manually notify hooks of a URL change (for edge cases like direct `location` assignment)

### Diagnostics

| Export | Description |
|--------|-------------|
| `classifyParam(param, raw)` | Classify a single raw URL value: `'absent' \| 'canonical' \| 'stale' \| 'malformed'` |
| `inspectUrl(params, strategy?)` | Pure: returns `UrlDiagnostics` for the current URL given a param spec |
| `cleanUrl(params, policy?, strategy?)` | Mutates URL per `CleanUrlPolicy` (defaults are all `'keep'`); returns observed diagnostics |
| `ParamDiagnostic` | Per-key state tagged union |
| `UrlDiagnostics` | `{ unrecognized: string[], malformed: KeyedDiagnostic[], stale: KeyedDiagnostic[] }` |
| `CleanUrlPolicy` | `{ unrecognized?, malformed?, stale?: 'keep' \| 'strip' \| 'reset' \| 'normalize' }` |

## Examples <a id="examples"></a>

Projects using `use-prms`:

- **[awair.runsascoded.com]** – Air quality dashboard ([GitHub][awair-gh], [usage][awair-search])

  Example: [`?d=+br&y=thZ&t=-3d`][awair-example]
  - `d=+br`: devices (leading space = "include default")
  - `y=thZ`: Y-axes config
  - `t=-3d`: time range

- **[ctbk.dev]** – Citi Bike trip data explorer ([GitHub][ctbk-gh], [usage][ctbk-search])

- **[kbd.rbw.sh]** – Keyboard shortcut manager demo site ([GitHub][use-kbd-gh], [usage][use-kbd-search])

[awair.runsascoded.com]: https://awair.runsascoded.com
[awair-gh]: https://github.com/runsascoded/awair
[awair-search]: https://github.com/search?q=repo%3Arunsascoded%2Fawair+use-prms&type=code
[awair-example]: https://awair.runsascoded.com/?d=+br&y=thZ&t=-3d

[ctbk.dev]: https://ctbk.dev
[ctbk-gh]: https://github.com/hudcostreets/ctbk.dev
[ctbk-search]: https://github.com/search?q=repo%3Ahudcostreets%2Fctbk.dev+use-prms&type=code

[kbd.rbw.sh]: https://kbd.rbw.sh
[use-kbd-gh]: https://github.com/runsascoded/use-kbd
[use-kbd-search]: https://github.com/search?q=repo%3Arunsascoded%2Fuse-kbd+use-prms&type=code

## Reverse Inspo <a id="reverse-inspo"></a>

It's nice when URLs are concise but also reasonably human-readable. Some examples I've seen in the wild that exhibit room for improvement:

### UUID Soup (OpenAI Careers)
```
https://openai.com/careers/search/
  ?l=e8062547-b090-4206-8f1e-7329e0014e98%2C07ed9191-5bc6-421b-9883-f1ac2e276ad7
  &c=e1e973fe-6f0a-475f-9361-a9b6c095d869%2Cf002fe09-4cec-46b0-8add-8bf9ff438a62
    %2Cab2b9da4-24a4-47df-8bed-1ed5a39c7036%2C687d87ec-1505-40e7-a2b5-cc7f31c0ea48
    %2Cd36236ec-fb74-49bd-bd3f-9d8365e2e2cb%2C27c9a852-c401-450e-9480-d3b507b8f64a
    %2C6dd4a467-446d-4093-8d57-d4633a571123%2C7cba3ac0-2b6e-4d52-ad38-e39a5f61c73f
    %2C0f06f916-a404-414f-813f-6ac7ff781c61%2Cfb2b77c5-5f20-4a93-a1c4-c3d640d88e04
```
12 UUIDs for location and category filters. Each UUID is 36 characters. With short codes, this could be `?l=sf,ny&c=eng,res,des,acct,data,hr,infra,accel,acq,bus`.

### Encrypted Blobs (Supercast, Priceline)
```
https://feeds.supercast.com/episodes/8a1aa9e2dde4319825e6a8171b4d51fa1835ef4a
  6730170db60a92c8f0670bb08c3cef884f0e4288c970c980083820e89cd692f582c44cde
  544c7aae86fc721f69ed9f695a43e5e21f4d344b32e70bae48a8fe0ae8b472d99502041a
  bad3dc650a6973653c094eae0631f637d96bb42ab5d26b8ea6b1638b7ffa23f66e46282b
  52970b59b2c13f9e6214251ad793be244bb9dc7e5bd7cefe77b6ec71b06c85e3bc9c194a
  d4ca10b27cfd7b8b1c181b3d9aea144bb978d1d790f08d89049d5a29a477651f1b799eec
  827ed95209dc741207e2b331170cb01c625d51982913eb8757ef2b2037235624a7bbfab9
  8a641e98a507ee096d0678c8ab458fd87731a9a7a0bdc87a99fbbfe684be10f5d4259265
  68b041a308017ce2901b3c6bf4b3bc89a2b13f3c54047d2fc5f69e9a5053b5e5bb2e0f70
  a2a77d9a25c97b890faec970e29f1c6961b1e00ccd1d8ba9c4006ba8b657193fe5a5b8e4
  6aa6a86492c381c79afe09d347d25c550c195d080695e3b97c012be3ebf1e2e64bd9f6c2
  9977e4b34184858bcf99164010dc3746f49d90df559f7dfa6f029f50f35f7777c44d1247
  ecdfc7861969f172d63eb3acc620ac25919cdc5caf4397793b7d564ccc4b0519118027.mp3
  ?key=8kSKDMBUEi2TCGyzhdzZBVSN&v=0
```

```
https://www.priceline.com/relax/at/2003205/from/20240628/to/20240629/rooms/1
  ?meta-id=AyOy_-ov9Edvq6cYGWUbaO9KdvlksSZCnHtEiIUqbvfIqUNLp0ZV0WiDB-MXSyZhxM
    mSw6xJm0HTePNNo_NwvV_Mzo1DeUvJhE53dMnjIqnwb7rfeGGSHOuOML_0zcWCYppfcv6Cf8T
    Na_TIadYlC8PJkvC_qY7bm0lXIqygsn03MyXPyXyUCXNRcKiIm2QS5bWoOeiO48zWgHRtLUDm
    cNx8o6rdlIukl18vqu8RQYajSd3Yt9bbWwDTBjeEduJ2sfoh4Mi3XtGzbqy8YpUrRgIUCGCYf
    DHBdaS47dUkqKfqtQvY7yCPh9Y4YNUZtt9w-TRqndd6AdvbOMprSAbawg8IU5wIj-yEbZr82e
    CcQg2dylETYccSaRK07WHSEJx7
  &pclnId=0571D9ABC99167E702D55CD454625E1BD51BC6742D4EB3A6869799404CB9B21E0E31
    CA463BDC3DE5A56EDB9C6B55C3F06EB5CBBC77502608C5279D0943A5F2545B3F0E4366F3FB
    CCDE32424FB9D2CC10B7E2B68DD59C89151023C9B800744FDDF1C7D85AEB2CF27E
  &gid=5369&cityId=3000035889&cur=USD&backlink-id=gotjhpxt5bp
```
900 hex characters, 400-char tracking IDs, session blobs.

### Tracking Parameter Avalanche (Apple TV)
```
https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx
  ?ign-itscg=MC_20000&ign-itsct=atvp_brand_omd
  &mttn3pid=Google%20AdWords&mttnagencyid=a5e&mttncc=US
  &mttnsiteid=143238&mttnsubad=OUS2019927_1-592764821446-m
  &mttnsubkw=133111427260__zxnj5jSX_&mttnsubplmnt=
```
Seven `mttn*` tracking parameters that are excessively verbose (and come from a single ad click).

### Base64-Encoded Redirect URLs (Wired)
```
https://link.wired.com/external/39532383.1121/aHR0cHM6Ly9jb25kZW5hc3Quem9vbS
  51cy93ZWJpbmFyL3JlZ2lzdGVyL1dOX29kcldRdE5uUkdhSUN3MHZob0N3ckE_dXRtX3Nvd
  XJjZT1ubCZ1dG1fYnJhbmQ9d2lyZWQmdXRtX21haWxpbmc9V0lSX1BheXdhbGxTdWJzXzA0
  MjMyNV9TcGVjaWFsX0FJVW5sb2NrZWRfTkxTVUJTSW52aXRlJnV0bV9jYW1wYWlnbj1hdWQ
  tZGV2JnV0bV9tZWRpdW09ZW1haWwmdXRtX2NvbnRlbnQ9V0lSX1BheXdhbGxTdWJzXzA0Mj
  MyNV9TcGVjaWFsX0FJVW5sb2NrZWRfTkxTVUJTSW52aXRlJmJ4aWQ9NWNjOWUwZjdmYzk0M
  mQxM2ViMWY0YjhjJmNuZGlkPTUwNTQyMzY4Jmhhc2hhPTQwODY5ZjRmY2ExOWRkZjU2NTUz
  M2Q2NzMxYmVkMTExJmhhc2hiPWFjNzQxNjk4NjkyMTE1YWExOGRkNzg5N2JjMTIxNmIwNWM
  0YmI2ODgmaGFzaGM9ZTA5YTA4NzM0MTM3NDA4ODE3NzZlNjExNzQ3NzQ3NDM5ZDYzMGM2YT
  k0NGVmYTIwOGFhMzhhYTMwZjljYTE0NyZlc3JjPU9JRENfU0VMRUNUX0FDQ09VTlRfUEFHR
  Q/5cc9e0f7fc942d13eb1f4b8cB8513f7ce
```
A URL containing another (base64-encoded) URL containing UTM params, hashes, and tracking IDs.

### Kitchen Sink (Grubhub)
```
https://www.grubhub.com/restaurant/bobs-noodle-house-123-main-st-newark/4857291
  /grouporder/Xk7rPwchQfDsT3J9yCtghR
  ?pageNum=1&pageSize=20
  &facet=scheduled%3Afalse&facet=orderType%3AALL
  &includePartnerOrders=true&sorts=default&blockModal=true
  &utm_source=grubhub_web&utm_medium=content_owned
  &utm_campaign=product_sharedcart_join&utm_content=share-link
```
Session IDs, pagination defaults that could be omitted, boolean flags, four UTM parameters, and all more verbose than necessary, resulting in an unwieldy URL.

### The `use-prms` way

This may not be best in all cases, but `use-prms` encourages encoding the same information more compactly:

| Verbose                                | Compact                          | Meaning                              |
|----------------------------------------|----------------------------------|--------------------------------------|
| `?show_grid=true`                      | `?g`                             | Boolean flag                         |
| `?page_number=5&page_size=50`          | `?p=5x50`                        | Compact, combined state              |
| `?page_number=5&page_size=20`          | `?p=5`                           | Default values omitted               |
| `?category=e1e973fe-6f0a-...`          | `?c=eng`                         | Short, human-readable codes for enums |
| `?latitude=40.7128&longitude=-74.0060` | `?ll=40.7128-74.0060`            | Compact, combined state              |

URLs are part of your UI. Treat them with the same care as your design.

## License <a id="license"></a>

MIT
