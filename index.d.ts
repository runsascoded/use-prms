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
declare function useUrlState<T>(key: string, param: Param<T>, options?: UseUrlStateOptions | boolean): [T, (value: T) => void];
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
declare function useUrlStates<P extends Record<string, Param<any>>>(params: P, options?: UseUrlStateOptions | boolean): {
    values: {
        [K in keyof P]: P[K] extends Param<infer T> ? T : never;
    };
    setValues: (updates: Partial<{
        [K in keyof P]: P[K] extends Param<infer T> ? T : never;
    }>) => void;
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

export { ALPHABETS, type Alphabet, type AlphabetName, BASE64_CHARS, type Base64Options, type BinaryParamOptions, BitBuffer, type CodeMap, type Encoded, type FixedPoint, type Float, type FloatEncoding, type FloatParamOptions, type LocationStrategy, type MultiEncoded, type MultiParam, precisionSchemes as PRECISION_SCHEMES, type Pagination, type Param, type Point, type PointParamOptions, type PrecisionScheme, type UseUrlStateOptions, base64Decode, base64Encode, base64FloatParam, base64Param, binaryParam, boolParam, bytesToFloat, clearParams, codeParam, codesParam, createLookupMap, defStringParam, encodeFloatAllModes, encodePointAllModes, enumParam, floatParam, floatToBytes, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, hashStrategy, intParam, multiFloatParam, multiIntParam, multiStringParam, notifyLocationChange, numberArrayParam, optIntParam, paginationParam, parseMultiParams, parseParams, pointParam, precisionSchemes, queryStrategy, resolveAlphabet, resolvePrecision, serializeMultiParams, serializeParams, setDefaultStrategy, stringParam, stringsParam, toFixedPoint, toFloat, updateUrl, useMultiUrlState, useMultiUrlStates, useUrlState, useUrlStates, validateAlphabet };
