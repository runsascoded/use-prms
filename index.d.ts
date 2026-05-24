/**
 * Core multi-value operations and location strategies
 */
/**
 * Multi-value encoded representation
 * An array of strings representing multiple values for a single URL parameter key
 */
type MultiEncoded = string[];
/**
 * Location strategy interface for abstracting URL storage location
 * (query string vs hash fragment)
 */
interface LocationStrategy {
    /** Get raw string from location (for caching comparison) */
    getRaw(): string;
    /** Parse current location to multi-value params */
    parse(): Record<string, MultiEncoded>;
    /** Build URL string with updated params */
    buildUrl(base: URL, params: Record<string, MultiEncoded>): string;
    /** Subscribe to location changes, returns unsubscribe function */
    subscribe(callback: () => void): () => void;
}
/**
 * Parse URL string to multi-value params
 * Each key maps to an array of all values for that key
 */
declare function parseMultiParams(source: string | URLSearchParams): Record<string, MultiEncoded>;
/**
 * Serialize multi-value params to URL string format
 * Repeated keys are serialized as separate entries: key=a&key=b
 */
declare function serializeMultiParams(params: Record<string, MultiEncoded>): string;
/**
 * Query string location strategy
 * Reads/writes to window.location.search
 */
declare const queryStrategy: LocationStrategy;
/**
 * Hash fragment location strategy
 * Reads/writes to window.location.hash
 * Hash is parsed as URLSearchParams format: #key=value&key2=value2
 */
declare const hashStrategy: LocationStrategy;
/**
 * Notify all use-prms hooks that the URL has changed.
 * Note: With the History API patch, this is rarely needed since pushState/replaceState
 * automatically trigger notifications. Use this for edge cases like direct location assignment.
 */
declare function notifyLocationChange(): void;
/**
 * Clear all URL params.
 * @param strategy - Which location to clear (query or hash), defaults to query
 */
declare function clearParams(strategy?: 'query' | 'hash'): void;
/**
 * Get the current default location strategy
 */
declare function getDefaultStrategy(): LocationStrategy;
/**
 * Set the default location strategy
 * Called by entry points (e.g., hash.ts sets this to hashStrategy)
 */
declare function setDefaultStrategy(strategy: LocationStrategy): void;

/**
 * Built-in parameter types with smart defaults and minimal encoding
 */

/**
 * Optional string parameter.
 * - undefined → not present
 * - empty string → ?key=
 * - non-empty → ?key=value
 */
declare function stringParam(init?: string): Param<string | undefined>;
/**
 * Required string parameter with default.
 * Omitted from URL when equal to default.
 */
declare function defStringParam(init: string): Param<string>;
/**
 * Boolean parameter.
 * - true → ?key (valueless)
 * - false → not present
 */
declare const boolParam: Param<boolean>;
/**
 * Integer parameter with default.
 * Omitted from URL when equal to default.
 */
declare function intParam(init: number): Param<number>;
/**
 * Optional integer parameter.
 * - null → not present
 * - number → ?key=123
 */
declare const optIntParam: Param<number | null>;
/**
 * Enum parameter with validation.
 * Omitted from URL when equal to default.
 * Invalid values fall back to default with console warning.
 */
declare function enumParam<T extends string>(init: T, values: readonly T[]): Param<T>;
/**
 * String array parameter with delimiter.
 * Omitted from URL when equal to default.
 * Empty array encodes as empty string (?key=)
 */
declare function stringsParam(init?: string[], delimiter?: string): Param<string[]>;
/**
 * Number array parameter.
 * Omitted from URL when equal to default.
 * Uses comma delimiter.
 */
declare function numberArrayParam(init?: number[]): Param<number[]>;
/**
 * Pagination parameter combining offset and page size.
 * Uses space (which encodes as + in URLs) as delimiter.
 *
 * Encoding rules:
 * - offset=0, pageSize=default → not present (undefined)
 * - offset=0, pageSize=custom → " pageSize" (e.g., " 20" → +20 in URL)
 * - offset>0, pageSize=default → "offset" (e.g., "100")
 * - offset>0, pageSize=custom → "offset pageSize" (e.g., "100 20" → 100+20 in URL)
 *
 * @param defaultPageSize - The default page size (omitted from URL when used)
 * @param validPageSizes - Optional array of valid page sizes for validation
 */
type Pagination = {
    offset: number;
    pageSize: number;
};
declare function paginationParam(defaultPageSize: number, validPageSizes?: readonly number[]): Param<Pagination>;
/**
 * Code mapping for enum values - maps full values to short codes for compact URLs.
 * Can be specified as:
 * - Array of [value, code] tuples: [['Rides', 'r'], ['Minutes', 'm']]
 * - Object mapping values to codes: { Rides: 'r', Minutes: 'm' }
 */
type CodeMap<T extends string> = [T, string][] | Record<T, string>;
/**
 * Single-value enum parameter with short code mapping.
 * Maps full enum values to abbreviated codes for compact URLs.
 * Omitted from URL when equal to default.
 *
 * @example
 * // ?y=r for "Rides", ?y=m for "Minutes", omitted for default "Rides"
 * codeParam('Rides', [['Rides', 'r'], ['Minutes', 'm']])
 * // or with object syntax:
 * codeParam('Rides', { Rides: 'r', Minutes: 'm' })
 */
declare function codeParam<T extends string>(init: T, codeMap: CodeMap<T>): Param<T>;
/**
 * Multi-value parameter with short code mapping.
 * Maps full values to abbreviated codes for compact URLs.
 * Omitted from URL when all values are selected.
 *
 * @param allValues - Array of all possible values (used to detect "all selected")
 * @param codeMap - Mapping from values to short codes
 * @param separator - Delimiter between codes (default: '' for most compact URLs)
 *
 * @example
 * // Regions: ?r=nj for NYC+JC, ?r=njh or omitted for all three
 * codesParam(['NYC', 'JC', 'HOB'], [['NYC', 'n'], ['JC', 'j'], ['HOB', 'h']])
 * // or with object syntax and custom separator:
 * codesParam(['NYC', 'JC', 'HOB'], { NYC: 'n', JC: 'j', HOB: 'h' }, ',')
 */
declare function codesParam<T extends string>(allValues: readonly T[], codeMap: CodeMap<T>, separator?: string): Param<T[]>;

/**
 * Multi-value parameter types for handling repeated URL params
 * e.g., ?tag=a&tag=b&tag=c
 */

/**
 * A bidirectional converter between a typed value and its multi-value URL representation.
 * Similar to Param<T> but works with string[] instead of string | undefined.
 */
type MultiParam<T> = {
    encode: (value: T) => MultiEncoded;
    decode: (encoded: MultiEncoded) => T;
};
/**
 * Multi-value string array parameter.
 * Each string becomes a separate URL param with the same key.
 *
 * @example
 * // ?tag=a&tag=b&tag=c → ['a', 'b', 'c']
 * const [tags, setTags] = useMultiUrlState('tag', multiStringParam())
 */
declare function multiStringParam(init?: string[]): MultiParam<string[]>;
/**
 * Multi-value integer array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?id=1&id=2&id=3 → [1, 2, 3]
 * const [ids, setIds] = useMultiUrlState('id', multiIntParam())
 */
declare function multiIntParam(init?: number[]): MultiParam<number[]>;
/**
 * Multi-value float array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?val=1.5&val=2.7 → [1.5, 2.7]
 * const [vals, setVals] = useMultiUrlState('val', multiFloatParam())
 */
declare function multiFloatParam(init?: number[]): MultiParam<number[]>;

/**
 * Structured reporting on the state of the URL relative to a declared param
 * spec, plus an imperative cleanup helper. Decoupled by design: `inspectUrl`
 * is pure (no side effects); `cleanUrl` mutates the URL but never on its own
 * — callers opt in via policy. Together they let apps observe and (separately)
 * normalize URL state without conflating the two concerns.
 */

/**
 * Per-key diagnostic for a declared parameter.
 *
 * - `absent`: key not present in URL
 * - `canonical`: URL value round-trips identically (encode(decode(raw)) === raw)
 * - `stale`: URL parses cleanly but is in a non-canonical format — re-emitting would change the URL
 * - `malformed`: URL value is garbage — decode produced the default and re-encode differs from raw
 */
type ParamDiagnostic = {
    state: 'absent';
} | {
    state: 'canonical';
    raw: string;
} | {
    state: 'stale';
    raw: string;
    canonical: string | undefined;
} | {
    state: 'malformed';
    raw: string;
    canonical: string | undefined;
};
/** A keyed pointer to a non-canonical URL value plus its canonical form. */
interface KeyedDiagnostic {
    key: string;
    raw: string;
    /** What encode(decode(raw)) produced — the form the URL would take after normalization. `undefined` means the key would be stripped. */
    canonical: string | undefined;
}
/**
 * Structured report on the URL's relationship to a declared param spec.
 */
interface UrlDiagnostics {
    /** Keys present in the URL but not declared (and not declared-deprecated). */
    unrecognized: string[];
    /** Subset of declared-deprecated keys present in the URL. */
    deprecated: string[];
    /** Declared keys whose URL value is garbage. */
    malformed: KeyedDiagnostic[];
    /** Declared keys whose URL value parses but is non-canonical. */
    stale: KeyedDiagnostic[];
}
/** Record of declared params. */
type Params = Record<string, Param<any>>;
/** Map a params record `P` to the corresponding decoded-value record. */
type ParamValues<P extends Params> = {
    [K in keyof P]: P[K] extends Param<infer T> ? T : never;
};
/**
 * Function form of a deprecated entry: receives the old raw URL value,
 * returns a partial record from declared param keys to the new typed values.
 * `cleanUrl` encodes each via `params[k].encode(v)`.
 */
type DeprecatedMigration<P extends Params = Params> = (raw: string) => Partial<ParamValues<P>>;
/**
 * Declaration of which URL keys are deprecated:
 * - `string[]`: drop these keys.
 * - `Record<string, null | DeprecatedMigration<P>>`: `null` drops; a function
 *   migrates the old value to new typed param values, then drops the old key.
 */
type DeprecatedSpec<P extends Params = Params> = readonly string[] | {
    [key: string]: null | DeprecatedMigration<P>;
};
/** Info fired to `onDeprecated` for each deprecated key found in the URL. */
interface DeprecatedInfo {
    key: string;
    raw: string;
    /** Present only if a migration function ran for this key. */
    migrated?: Partial<ParamValues<Params>>;
}
/** Options accepted by `inspectUrl`. */
interface InspectUrlOptions<P extends Params = Params> {
    deprecated?: DeprecatedSpec<P>;
}
/**
 * Round-trip classify a single param's URL value. Pure helper; usable
 * outside React.
 *
 * Note on the malformed/stale split: when a URL legitimately encodes the
 * default value in a non-canonical format, this is reported as `malformed`
 * (a benign false-positive — `cleanUrl` with `malformed: 'reset'` produces
 * the correct outcome of stripping the key, since the value is the default).
 */
declare function classifyParam<T>(param: Param<T>, raw: string | undefined): ParamDiagnostic;
/**
 * Inspect the current URL relative to a declared param spec. Pure — does
 * not mutate the URL.
 */
declare function inspectUrl<P extends Params>(params: P, options?: InspectUrlOptions<P>, strategy?: LocationStrategy): UrlDiagnostics;
/**
 * Policy for `cleanUrl`. Each axis is independent; defaults are conservative
 * (`'keep'` everywhere — `cleanUrl` is a no-op until the caller opts in).
 */
interface CleanUrlPolicy<P extends Params = Params> {
    /** What to do with unrecognized keys. Default: `'keep'`. */
    unrecognized?: 'keep' | 'strip';
    /** What to do with malformed values. `'reset'` re-emits canonical (stripping the key when canonical is `undefined`). Default: `'keep'`. */
    malformed?: 'keep' | 'reset';
    /** What to do with stale values. `'normalize'` re-emits canonical. Default: `'keep'`. */
    stale?: 'keep' | 'normalize';
    /**
     * Named keys to strip (optionally migrating first). See `DeprecatedSpec`.
     * Independent of `unrecognized`.
     */
    deprecated?: DeprecatedSpec<P>;
    /**
     * Fires once per deprecated key actually present in the URL. Default:
     * `console.warn` with a structured message. Pass `null` to silence.
     */
    onDeprecated?: ((info: DeprecatedInfo) => void) | null;
}
/**
 * Apply a cleanup policy to the current URL in-place (via
 * `history.replaceState`). Returns the diagnostics observed (so the caller
 * can log/notify based on what was acted on).
 *
 * Calling with the default policy (`{}`) returns diagnostics without
 * touching the URL — equivalent to `inspectUrl`.
 */
declare function cleanUrl<P extends Params>(params: P, policy?: CleanUrlPolicy<P>, strategy?: LocationStrategy): UrlDiagnostics;

/**
 * React hooks for managing URL parameters
 */

/**
 * Options for useUrlState hook
 */
interface UseUrlStateOptions {
    /**
     * Debounce URL writes in milliseconds.
     * State updates immediately, but URL updates are debounced.
     * Useful for high-frequency updates (dragging, animation, typing).
     * @default 0 (no debounce)
     */
    debounce?: number;
    /**
     * Use pushState (true) or replaceState (false) when updating URL.
     * @default false (replaceState)
     */
    push?: boolean;
    /**
     * Fired with a `ParamDiagnostic` whenever the URL value for this key
     * changes. Use to log/warn about stale or malformed inputs without
     * tying that to cleanup.
     */
    onDiagnostic?: (diag: ParamDiagnostic) => void;
}
/**
 * Options for `useUrlStates` (multi-key) — extends single-key options with
 * URL-level reporting and cleanup.
 */
interface UseUrlStatesOptions<P extends Params = Params> extends Omit<UseUrlStateOptions, 'onDiagnostic'> {
    /**
     * Fired with a `UrlDiagnostics` whenever the URL changes. Reports
     * unrecognized keys, malformed values, and stale-format values.
     */
    onDiagnostics?: (diag: UrlDiagnostics) => void;
    /**
     * If set, runs `cleanUrl(params, policy)` once on mount. Independent of
     * `onDiagnostics`: callers can observe without acting, or act without
     * observing, or both.
     */
    cleanOnMount?: CleanUrlPolicy<P>;
}
/**
 * React hook for managing a single URL query parameter.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param key - Query parameter key
 * @param param - Param encoder/decoder
 * @param options - Options (debounce, push)
 * @returns Tuple of [value, setValue]
 *
 * @example
 * ```tsx
 * // Basic usage
 * const [zoom, setZoom] = useUrlState('z', boolParam)
 *
 * // With debounce for high-frequency updates
 * const [position, setPosition] = useUrlState('pos', floatParam(0), { debounce: 300 })
 * ```
 */
declare function useUrlState<T>(key: string, param: Param<T>, options?: UseUrlStateOptions | boolean): [T, (value: T) => void, ParamDiagnostic];
/**
 * React hook for managing multiple URL query parameters together.
 * Updates are batched into a single history entry.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param params - Object mapping keys to Param types
 * @param options - Options (debounce, push)
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useUrlStates({
 *   zoom: boolParam,
 *   device: stringParam('default'),
 *   count: intParam(10)
 * })
 *
 * // Update multiple params at once
 * setValues({ zoom: true, count: 20 })
 * ```
 */
declare function useUrlStates<P extends Record<string, Param<any>>>(params: P, options?: UseUrlStatesOptions<P> | boolean): {
    values: {
        [K in keyof P]: P[K] extends Param<infer T> ? T : never;
    };
    setValues: (updates: Partial<{
        [K in keyof P]: P[K] extends Param<infer T> ? T : never;
    }>) => void;
    diagnostics: UrlDiagnostics;
};
/**
 * React hook for managing a single multi-value URL parameter.
 * Supports repeated params like ?tag=a&tag=b&tag=c
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param key - Query parameter key
 * @param param - MultiParam encoder/decoder
 * @param options - Options (debounce, push)
 * @returns Tuple of [value, setValue]
 *
 * @example
 * ```tsx
 * const [tags, setTags] = useMultiUrlState('tag', multiStringParam())
 * // URL: ?tag=a&tag=b → tags = ['a', 'b']
 * ```
 */
declare function useMultiUrlState<T>(key: string, param: MultiParam<T>, options?: UseUrlStateOptions | boolean): [T, (value: T) => void];
/**
 * React hook for managing multiple multi-value URL parameters together.
 * Updates are batched into a single history entry.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param params - Object mapping keys to MultiParam types
 * @param options - Options (debounce, push)
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useMultiUrlStates({
 *   tags: multiStringParam(),
 *   ids: multiIntParam()
 * })
 *
 * // Update multiple multi-value params at once
 * setValues({ tags: ['a', 'b'], ids: [1, 2, 3] })
 * ```
 */
declare function useMultiUrlStates<P extends Record<string, MultiParam<any>>>(params: P, options?: UseUrlStateOptions | boolean): {
    values: {
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    };
    setValues: (updates: Partial<{
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    }>) => void;
};

/**
 * Base64 alphabet definitions and utilities
 *
 * Provides named presets for common base64 alphabets and validation.
 */
/**
 * Named alphabet presets
 */
declare const ALPHABETS: {
    /**
     * RFC 4648 base64url alphabet (default)
     * Standard URL-safe encoding, but NOT lexicographically sortable.
     */
    readonly rfc4648: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    /**
     * ASCII-ordered alphabet for lexicographic sortability
     * Encoded strings sort in the same order as their numeric values.
     * Uses URL-safe characters only (- and _).
     */
    readonly sortable: "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
};
/**
 * Preset alphabet names
 */
type AlphabetName = keyof typeof ALPHABETS;
/**
 * Alphabet specification: either a preset name or a 64-character string
 */
type Alphabet = AlphabetName | (string & {});
/**
 * Validate an alphabet string
 * @throws Error if alphabet is invalid
 */
declare function validateAlphabet(alphabet: string): void;
/**
 * Resolve an alphabet specification to a 64-character string
 * @param alphabet - Preset name or 64-character string
 * @returns The resolved alphabet string
 * @throws Error if alphabet is invalid
 */
declare function resolveAlphabet(alphabet: Alphabet): string;
/**
 * Create a reverse lookup map for decoding
 */
declare function createLookupMap(alphabet: string): Map<string, number>;

/**
 * Binary encoding utilities for compact URL parameters
 *
 * Provides base64url encoding for arbitrary binary data.
 * Use these to create compact URL representations of complex data structures.
 */

/**
 * URL-safe base64 alphabet (RFC 4648 base64url)
 * Uses - and _ instead of + and / for URL safety
 * @deprecated Use ALPHABETS.rfc4648 instead
 */
declare const BASE64_CHARS: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/**
 * Options for base64 encoding/decoding
 */
interface Base64Options {
    /**
     * Alphabet to use: preset name or 64-character string
     * @default 'rfc4648'
     */
    alphabet?: Alphabet;
}
/**
 * Encode a Uint8Array to base64 string
 * @param bytes - The bytes to encode
 * @param options - Encoding options (alphabet)
 */
declare function base64Encode(bytes: Uint8Array, options?: Base64Options): string;
/**
 * Decode a base64 string to Uint8Array
 * @param str - The base64 string to decode
 * @param options - Decoding options (alphabet)
 */
declare function base64Decode(str: string, options?: Base64Options): Uint8Array;
/**
 * Options for binary param creation
 */
interface BinaryParamOptions<T> {
    /**
     * Convert value to bytes
     */
    toBytes: (value: T) => Uint8Array;
    /**
     * Convert bytes to value
     */
    fromBytes: (bytes: Uint8Array) => T;
    /**
     * Alphabet to use: preset name or 64-character string
     * @default 'rfc4648'
     */
    alphabet?: Alphabet;
}

/**
 * Create a param that encodes/decodes via binary representation
 *
 * This is a mid-level helper for creating custom binary-encoded params.
 * You provide toBytes/fromBytes converters, and it handles the base64url encoding.
 *
 * @example
 * ```ts
 * // Custom binary encoding for a shape array
 * const shapesParam = binaryParam<Shape[]>({
 *   toBytes: (shapes) => encodeShapesToBytes(shapes),
 *   fromBytes: (bytes) => decodeBytesToShapes(bytes),
 * })
 *
 * // Use with useUrlState
 * const [shapes, setShapes] = useUrlState('s', shapesParam)
 * ```
 */
declare function binaryParam<T>(options: BinaryParamOptions<T>): Param<T | null>;
/**
 * Create a base64-encoded binary param
 * Shorthand for binaryParam
 */
declare function base64Param<T>(toBytes: (value: T) => Uint8Array, fromBytes: (bytes: Uint8Array) => T, alphabet?: Alphabet): Param<T | null>;
/**
 * Convert a 64-bit float to 8 bytes (IEEE 754 big-endian)
 */
declare function floatToBytes(value: number): Uint8Array;
/**
 * Convert 8 bytes to a 64-bit float (IEEE 754 big-endian)
 */
declare function bytesToFloat(bytes: Uint8Array): number;

/**
 * Float encoding utilities for compact URL parameters
 *
 * Provides IEEE 754 decomposition, fixed-point conversion, and bit-level packing
 * for encoding floats with configurable precision.
 */

/**
 * Decomposed IEEE 754 double-precision float
 */
interface Float {
    neg: boolean;
    exp: number;
    mant: bigint;
}
/**
 * Fixed-point representation with shared exponent
 */
interface FixedPoint {
    neg: boolean;
    exp: number;
    mant: bigint;
}
/**
 * Precision scheme for fixed-point encoding
 */
interface PrecisionScheme {
    expBits: number;
    mantBits: number;
}
/**
 * Predefined precision schemes for reference
 * Higher mantBits = more precision, larger URL
 */
declare const precisionSchemes: PrecisionScheme[];
/**
 * Resolve precision option to a PrecisionScheme
 * Accepts mantissa bits (number) or a full custom scheme
 */
declare function resolvePrecision(precision: number | PrecisionScheme | undefined): PrecisionScheme;
/**
 * Decompose an IEEE 754 double into sign, exponent, and mantissa
 */
declare function toFloat(x: number): Float;
/**
 * Reconstruct a number from decomposed IEEE 754 components
 */
declare function fromFloat({ neg, exp, mant }: Float): number;
/**
 * Convert a decomposed float to fixed-point with specified mantissa bits
 */
declare function toFixedPoint(f: Float, opts: {
    mantBits: number;
    exp?: number;
}): FixedPoint;
/**
 * Convert a fixed-point value back to decomposed float
 */
declare function fromFixedPoint(f: FixedPoint, mantBits: number): Float;
/**
 * Bit-level buffer for packing/unpacking arbitrary bit widths
 *
 * Use this for custom binary encodings. Pack data with encodeInt/encodeBigInt,
 * then convert to base64 for URL-safe strings.
 *
 * @example
 * ```ts
 * // Encoding
 * const buf = new BitBuffer()
 * buf.encodeInt(myEnum, 3)      // 3 bits for enum
 * buf.encodeInt(myCount, 8)     // 8 bits for count
 * buf.encodeBigInt(myId, 48)    // 48 bits for ID
 * const urlParam = buf.toBase64()
 *
 * // Decoding
 * const buf = BitBuffer.fromBase64(urlParam)
 * const myEnum = buf.decodeInt(3)
 * const myCount = buf.decodeInt(8)
 * const myId = buf.decodeBigInt(48)
 * ```
 */
declare class BitBuffer {
    buf: number[];
    byteOffset: number;
    bitOffset: number;
    end: number;
    constructor(numBytes?: number);
    get totalBitOffset(): number;
    seek(totalBitOffset: number): BitBuffer;
    /**
     * Encode an integer with specified bit width
     */
    encodeInt(n: number, numBits: number): BitBuffer;
    /**
     * Decode an integer with specified bit width
     */
    decodeInt(numBits: number): number;
    /**
     * Encode a bigint with specified bit width
     */
    encodeBigInt(n: bigint, numBits: number): BitBuffer;
    /**
     * Decode a bigint with specified bit width
     */
    decodeBigInt(numBits: number): bigint;
    /**
     * Encode an array of floats with shared exponent
     */
    encodeFixedPoints(vals: number[], { expBits, mantBits }: PrecisionScheme): BitBuffer;
    /**
     * Decode an array of floats with shared exponent
     */
    decodeFixedPoints(count: number, { expBits, mantBits }: PrecisionScheme): number[];
    /**
     * Get bytes as Uint8Array
     */
    toBytes(): Uint8Array;
    /**
     * Create from bytes
     */
    static fromBytes(bytes: Uint8Array): BitBuffer;
    /**
     * Convert buffer to URL-safe base64 string
     *
     * Encodes bits directly to base64 (6 bits per character) for maximum compactness.
     * This is more efficient than going through bytes when bit count isn't a multiple of 8.
     *
     * @param options - Base64 options (alphabet)
     */
    toBase64(options?: Base64Options): string;
    /**
     * Create a BitBuffer from a URL-safe base64 string
     *
     * Decodes base64 directly to bits (6 bits per character).
     *
     * @param str - The base64 string to decode
     * @param options - Base64 options (alphabet)
     */
    static fromBase64(str: string, options?: Base64Options): BitBuffer;
}

/**
 * Encoding mode for float params
 */
type FloatEncoding = 'string' | 'base64';
/**
 * Options for floatParam
 */
interface FloatParamOptions {
    /** Default value when param is missing */
    default?: number;
    /** Encoding mode: 'base64' (default) or 'string' */
    encoding?: FloatEncoding;
    /** For string encoding: number of decimal places */
    decimals?: number;
    /** For lossy base64: exponent bits (requires mant) */
    exp?: number;
    /** For lossy base64: mantissa bits (requires exp) */
    mant?: number;
    /** For lossy base64: string shorthand like '5+22' (exp+mant) */
    precision?: string;
    /** For base64: alphabet preset or 64-char string */
    alphabet?: Alphabet;
}
/**
 * Create a float param with configurable encoding
 *
 * @example
 * ```ts
 * // Lossless base64 (default) - 11 chars, exact
 * const f = floatParam(0)
 * const f = floatParam({ default: 0 })
 * const f = floatParam({ default: 0, encoding: 'base64' })
 *
 * // Lossy base64 - fewer chars, approximate
 * const f = floatParam({ default: 0, encoding: 'base64', exp: 5, mant: 22 })
 * const f = floatParam({ default: 0, encoding: 'base64', precision: '5+22' })
 *
 * // String encoding - full precision toString()
 * const f = floatParam({ default: 0, encoding: 'string' })
 *
 * // Truncated string - fixed decimal places
 * const f = floatParam({ default: 0, encoding: 'string', decimals: 6 })
 * ```
 */
declare function floatParam(optsOrDefault?: number | FloatParamOptions): Param<number>;
/**
 * Create an optional float param with configurable encoding
 *
 * Like `floatParam` but absent → `null` instead of a default number.
 * `null` encodes as absent (removed from URL); any number (including 0) encodes normally.
 *
 * @example
 * ```ts
 * // Lossless base64 (default)
 * const f = optFloatParam()
 *
 * // Lossy base64
 * const f = optFloatParam({ encoding: 'base64', exp: 5, mant: 22 })
 *
 * // String encoding with fixed decimals
 * const f = optFloatParam({ encoding: 'string', decimals: 2 })
 *
 * // Full precision string
 * const f = optFloatParam({ encoding: 'string' })
 * ```
 */
declare function optFloatParam(opts?: Omit<FloatParamOptions, 'default'>): Param<number | null>;
/**
 * Convenience wrapper for base64 float encoding
 *
 * @example
 * ```ts
 * base64FloatParam(0)                    // lossless
 * base64FloatParam({ exp: 5, mant: 22 }) // lossy
 * ```
 */
declare function base64FloatParam(optsOrDefault?: number | Omit<FloatParamOptions, 'encoding' | 'decimals'>): Param<number>;
/**
 * 2D point type
 */
interface Point {
    x: number;
    y: number;
}
/**
 * Options for point param
 */
interface PointParamOptions {
    /** Encoding mode */
    encoding?: FloatEncoding;
    /** For string encoding: decimal places */
    decimals?: number;
    /** For binary encoding: mantissa bits (8-52) or custom scheme. Default: 22 bits */
    precision?: number | PrecisionScheme;
    /** Default point when param is missing */
    default?: Point;
    /** For base64: alphabet preset or 64-char string */
    alphabet?: Alphabet;
}
/**
 * Create a param for encoding a 2D point
 *
 * String mode: "x,y" with truncated decimals
 * Binary mode: packed fixed-point with shared exponent
 *
 * @example
 * ```ts
 * // String encoding
 * const posParam = pointParam({ encoding: 'string', decimals: 2 })
 * posParam.encode({ x: 1.234, y: 5.678 }) // "1.23 5.68"
 *
 * // Binary encoding (more compact)
 * const posParam = pointParam({ encoding: 'base64', precision: 22 })
 * posParam.encode({ x: 1.234, y: 5.678 }) // compact base64
 * ```
 */
declare function pointParam(opts?: PointParamOptions): Param<Point | null>;
/**
 * Encode a float to string and base64 representations for comparison
 *
 * Utility for demo/debugging to show encoding modes
 */
declare function encodeFloatAllModes(value: number, opts?: {
    decimals?: number;
    precision?: number | PrecisionScheme;
}): {
    string: string;
    base64: string;
    bits: number;
};
/**
 * Encode a point to string and base64 representations for comparison
 */
declare function encodePointAllModes(point: Point, opts?: {
    decimals?: number;
    precision?: number | PrecisionScheme;
}): {
    string: string;
    base64: string;
    bits: number;
};
/**
 * Lat/lng/zoom (+ optional pitch/bearing) for map views
 */
interface LLZ {
    lat: number;
    lng: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
}
/**
 * Options for llzParam
 */
interface LLZParamOptions {
    /** Default value when param is missing */
    default: LLZ;
    /** Decimal places for lat/lng (default: 4, ≈11m precision) */
    latLngDecimals?: number;
    /** Decimal places for zoom (default: 2) */
    zoomDecimals?: number;
    /** Decimal places for pitch (default: 0) */
    pitchDecimals?: number;
    /** Decimal places for bearing (default: 0) */
    bearingDecimals?: number;
    /** Field delimiter for non-signDelim mode. Default: `'_'` (URL-safe in
     *  both query and hash params). Ignored when `signDelim` is true. */
    delimiter?: string;
    /** "Sign-as-delimiter" mode (default: `true`): `' '` (URL-encodes to `+`)
     *  between non-negative numbers, no delimiter before negative numbers
     *  (the `-` itself separates). Reads naturally for signed coords:
     *  `40.7400 -74.0120 11.80 0 0` (URL: `40.7400+-74.0120+11.80+0+0`). On
     *  decode, any of `[ +\-_,]` (and other non-numeric chars) act as
     *  separators, so URLs in older delimited formats still parse — encode
     *  re-emits in the current format, auto-migrating in-place. */
    signDelim?: boolean;
}
/**
 * Create a param for encoding map view state (lat/lng/zoom, optional
 * pitch/bearing). Pitch/bearing are included in the encoding only when
 * present in the default value.
 *
 * @example
 * ```ts
 * const [view, setView] = useUrlState('ll', llzParam({
 *   default: { lat: 40.74, lng: -74.012, zoom: 11.8 },
 * }))
 * // URL: ?ll=40.7400+-74.0120+11.80   (signDelim default; literal ` `=`+`)
 *
 * // With pitch and bearing
 * const [view, setView] = useUrlState('ll', llzParam({
 *   default: { lat: 40.74, lng: -74.012, zoom: 11.8, pitch: 0, bearing: 0 },
 * }))
 * // URL: ?ll=40.7400+-74.0120+11.80+0+0
 * ```
 */
declare function llzParam(opts: LLZParamOptions): Param<LLZ>;
/**
 * deck.gl / MapLibre ViewState (latitude/longitude field names, full camera).
 *
 * Distinct from `LLZ`: deck.gl convention uses `latitude`/`longitude`
 * (full names, not abbreviations) and treats pitch/bearing as required.
 */
interface ViewState {
    latitude: number;
    longitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
}
interface ViewStateParamOptions {
    /** Default value. When `null`, a missing param decodes as `null` (useful
     *  for "user has not overridden the auto-fit" semantics). When a
     *  `ViewState` is provided, missing/garbage decodes as that value. */
    default: ViewState | null;
    /** Decimal places for lat/lng (default: 4, ≈11m precision) */
    latLngDecimals?: number;
    /** Decimal places for zoom (default: 2) */
    zoomDecimals?: number;
    /** Decimal places for pitch (default: 0) */
    pitchDecimals?: number;
    /** Decimal places for bearing (default: 0) */
    bearingDecimals?: number;
    /** Field delimiter for non-signDelim mode. Default: `'_'`. Ignored when
     *  `signDelim` is true. */
    delimiter?: string;
    /** Sign-as-delimiter mode (default: `true`). See `llzParam` docstring. */
    signDelim?: boolean;
    /** Pitch fallback when decoding a string with only 3 fields (lat/lng/zoom).
     *  Default: 0. Common alternate: 45 (matches the deck.gl 3D-tilt convention
     *  some projects bake in). Only used when `default` is null. */
    pitchFallback?: number;
    /** Bearing fallback when decoding lat/lng/zoom-only strings. Default: 0. */
    bearingFallback?: number;
}
/**
 * Camera-state URL param using deck.gl ViewState field names. Supports a
 * nullable default (returns `null` when the URL param is absent, distinct
 * from "decode to default").
 *
 * @example
 * ```ts
 * const [view, setView] = useUrlState('llz', viewStateParam({
 *   default: null,
 * }))
 * // view is `ViewState | null` — null means "no user override, use auto-fit"
 * ```
 */
declare function viewStateParam(opts: ViewStateParamOptions): Param<ViewState | null>;
/**
 * Bounding box (sw, ne corners as lat/lng pairs).
 */
interface BBox {
    sw: {
        lat: number;
        lng: number;
    };
    ne: {
        lat: number;
        lng: number;
    };
}
interface BBoxParamOptions {
    /** Default value when param is missing */
    default: BBox;
    /** Decimal places for lat/lng (default: 4, ≈11m precision) */
    latLngDecimals?: number;
    /** Field delimiter for non-signDelim mode. Default: `'_'`. Ignored when
     *  `signDelim` is true. */
    delimiter?: string;
    /** Sign-as-delimiter mode (default: `true`). See `llzParam` docstring. */
    signDelim?: boolean;
}
/**
 * Bounding-box URL param (sw.lat, sw.lng, ne.lat, ne.lng).
 *
 * Useful for sharing a region independent of camera state. When the camera
 * (`llzParam`) is what you want, use that; bbox is for "look at this area
 * regardless of how my window is shaped."
 *
 * @example
 * ```ts
 * const [bb, setBB] = useUrlState('bb', bboxParam({
 *   default: { sw: { lat: 40.7, lng: -74.1 }, ne: { lat: 40.8, lng: -74.0 } },
 * }))
 * // URL: ?bb=40.7000-74.1000+40.8000-74.0000   (signDelim default)
 * ```
 */
declare function bboxParam(opts: BBoxParamOptions): Param<BBox>;

/**
 * Generic primitive for URL params that pack a heterogeneous tuple of
 * numbers (each with its own encoding — fixed decimals, significant figures,
 * or integer truncation) into a single delimited string. Subsumes the
 * pattern used by `llzParam`, `bboxParam`, `viewStateParam`, and similar
 * factories.
 */

/**
 * Encoding for a single number field within a tuple. Exactly one of
 * `decimals`, `sigfigs`, or `int` should be set.
 */
type NumberFieldEncoding = {
    decimals: number;
    sigfigs?: undefined;
    int?: undefined;
} | {
    sigfigs: number;
    decimals?: undefined;
    int?: undefined;
} | {
    int: true;
    decimals?: undefined;
    sigfigs?: undefined;
};
/**
 * Recursive type extracting dotted paths to `number`-valued leaves of `T`.
 *
 * @example
 * type P = NumberPath<{ x: number; nested: { lat: number; name: string } }>
 * // P = 'x' | 'nested.lat'  (note: 'nested.name' excluded since string)
 */
type NumberPath<T> = NumberPathRec<T, ''>;
type NumberPathRec<T, P extends string> = NonNullable<T> extends number ? P extends '' ? never : P : NonNullable<T> extends object ? {
    [K in keyof NonNullable<T> & string]: NumberPathRec<NonNullable<T>[K], P extends '' ? K : `${P}.${K}`>;
}[keyof NonNullable<T> & string] : never;
/** A field declaration: where in `T` the number lives, and how to format it. */
type NumberTupleField<T> = NumberFieldEncoding & {
    path: NumberPath<T>;
};
interface NumberTupleParamOptions<T extends object> {
    /** Default value. Returned (cloned) when decoding missing/empty input.
     *  Also used per-field as fallback for any field whose part is missing or
     *  unparseable. */
    default: T;
    /** Field declarations, in tuple order. */
    fields: NumberTupleField<T>[];
    /** Field delimiter for non-signDelim mode. Default: `'_'`. Ignored when
     *  `signDelim` is true. */
    delimiter?: string;
    /** "Sign-as-delimiter" mode (default: `true`): a space (URL-encodes to
     *  `+`) between non-negative parts, no delimiter before negative parts
     *  (the `-` itself separates). Reads more naturally for signed
     *  coordinates: `40.74 -74.01 11.8`. On decode, any of `[ +\-_,]` (and
     *  other non-numeric chars) acts as a separator, so URLs in any prior
     *  delimited format still parse correctly — encode then re-emits in the
     *  current format, effectively auto-migrating in-place. */
    signDelim?: boolean;
    /** When false, `encode` always emits (never returns undefined even if the
     *  value matches `default`). Default: true. Useful for nullable wrappers
     *  where a synthetic default is used only for per-field fallback. */
    omitDefault?: boolean;
}
/**
 * Format a list of numeric parts into a single string, using either a fixed
 * delimiter or the signed-delim convention. Exposed for advanced reuse
 * (e.g. building custom tuple-style encodings on top).
 */
declare function formatSignedParts(parts: string[], delimiter: string, signDelim: boolean): string;
/**
 * Split an encoded string into numeric parts. In `signDelim` mode, matches
 * any signed-decimal substrings (so `[ +\-_]` all act as separators, with
 * `-` retained as part of the next number). Otherwise splits on the literal
 * delimiter.
 */
declare function parseSignedParts(s: string, delimiter: string, signDelim: boolean): string[];
/**
 * Create a `Param<T>` that encodes a tuple of numbers (each at a typed path
 * within `T`) into a single delimited string.
 *
 * @example Flat shape, mixed encodings
 * ```ts
 * const p = numberTupleParam<{ lat: number; lng: number; count: number }>({
 *   default: { lat: 0, lng: 0, count: 0 },
 *   fields: [
 *     { path: 'lat', decimals: 4 },
 *     { path: 'lng', decimals: 4 },
 *     { path: 'count', int: true },
 *   ],
 * })
 * // signDelim defaults to true → e.g. `40.7400 -74.0120 5`
 * ```
 *
 * @example Nested shape (TS validates dotted paths)
 * ```ts
 * type BBox = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }
 * const p = numberTupleParam<BBox>({
 *   default: { sw: { lat: 0, lng: 0 }, ne: { lat: 0, lng: 0 } },
 *   fields: [
 *     { path: 'sw.lat', decimals: 4 },
 *     { path: 'sw.lng', decimals: 4 },
 *     { path: 'ne.lat', decimals: 4 },
 *     { path: 'ne.lng', decimals: 4 },
 *   ],
 * })
 * ```
 */
declare function numberTupleParam<T extends object>(opts: NumberTupleParamOptions<T>): Param<T>;

/**
 * Core types and utilities for URL parameter management
 */

/**
 * Encodes a value to a URL query parameter string.
 * - undefined: parameter not present in URL
 * - "": valueless parameter (e.g., ?z)
 * - string: parameter with value (e.g., ?z=foo)
 */
type Encoded = string | undefined;
/**
 * A bidirectional converter between a typed value and its URL representation.
 */
type Param<T> = {
    encode: (value: T) => Encoded;
    decode: (encoded: Encoded) => T;
};
/**
 * Serialize query parameters to URL string.
 * Uses URLSearchParams for proper form-urlencoded format (space → +)
 * Handles valueless params (empty string → ?key without =) manually
 *
 * @deprecated For multi-value support, use serializeMultiParams instead
 */
declare function serializeParams(params: Record<string, Encoded>): string;
/**
 * Parse query parameters from URL string or URLSearchParams.
 * Note: URLSearchParams treats ?z and ?z= identically (both as empty string).
 * Note: For repeated params, only the first value is returned.
 *
 * @deprecated For multi-value support, use parseMultiParams instead
 */
declare function parseParams(source: string | URLSearchParams): Record<string, Encoded>;
/**
 * Get current URL query parameters (browser only)
 */
declare function getCurrentParams(): Record<string, Encoded>;
/**
 * Update URL without reloading (browser only)
 * @param params - New query parameters
 * @param push - Use pushState (true) or replaceState (false)
 */
declare function updateUrl(params: Record<string, Encoded>, push?: boolean): void;

export { ALPHABETS, type Alphabet, type AlphabetName, BASE64_CHARS, type BBox, type BBoxParamOptions, type Base64Options, type BinaryParamOptions, BitBuffer, type CleanUrlPolicy, type CodeMap, type DeprecatedInfo, type DeprecatedMigration, type DeprecatedSpec, type Encoded, type FixedPoint, type Float, type FloatEncoding, type FloatParamOptions, type InspectUrlOptions, type KeyedDiagnostic, type LLZ, type LLZParamOptions, type LocationStrategy, type MultiEncoded, type MultiParam, type NumberFieldEncoding, type NumberPath, type NumberTupleField, type NumberTupleParamOptions, precisionSchemes as PRECISION_SCHEMES, type Pagination, type Param, type ParamDiagnostic, type ParamValues, type Params, type Point, type PointParamOptions, type PrecisionScheme, type UrlDiagnostics, type UseUrlStateOptions, type UseUrlStatesOptions, type ViewState, type ViewStateParamOptions, base64Decode, base64Encode, base64FloatParam, base64Param, bboxParam, binaryParam, boolParam, bytesToFloat, classifyParam, cleanUrl, clearParams, codeParam, codesParam, createLookupMap, defStringParam, encodeFloatAllModes, encodePointAllModes, enumParam, floatParam, floatToBytes, formatSignedParts, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, hashStrategy, inspectUrl, intParam, llzParam, multiFloatParam, multiIntParam, multiStringParam, notifyLocationChange, numberArrayParam, numberTupleParam, optFloatParam, optIntParam, paginationParam, parseMultiParams, parseParams, parseSignedParts, pointParam, precisionSchemes, queryStrategy, resolveAlphabet, resolvePrecision, serializeMultiParams, serializeParams, setDefaultStrategy, stringParam, stringsParam, toFixedPoint, toFloat, updateUrl, useMultiUrlState, useMultiUrlStates, useUrlState, useUrlStates, validateAlphabet, viewStateParam };
