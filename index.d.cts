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
 * Float parameter with default.
 * Omitted from URL when equal to default.
 */
declare function floatParam(init: number): Param<number>;
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
 * const [tags, setTags] = useMultiUrlParam('tag', multiStringParam())
 */
declare function multiStringParam(init?: string[]): MultiParam<string[]>;
/**
 * Multi-value integer array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?id=1&id=2&id=3 → [1, 2, 3]
 * const [ids, setIds] = useMultiUrlParam('id', multiIntParam())
 */
declare function multiIntParam(init?: number[]): MultiParam<number[]>;
/**
 * Multi-value float array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?val=1.5&val=2.7 → [1.5, 2.7]
 * const [vals, setVals] = useMultiUrlParam('val', multiFloatParam())
 */
declare function multiFloatParam(init?: number[]): MultiParam<number[]>;

/**
 * React hooks for managing URL parameters
 */

/**
 * React hook for managing a single URL query parameter.
 *
 * @param key - Query parameter key
 * @param param - Param encoder/decoder
 * @param push - Use pushState (true) or replaceState (false) when updating
 * @returns Tuple of [value, setValue]
 *
 * @example
 * ```tsx
 * const [zoom, setZoom] = useUrlParam('z', boolParam)
 * const [device, setDevice] = useUrlParam('d', stringParam('default'))
 * ```
 */
declare function useUrlParam<T>(key: string, param: Param<T>, push?: boolean): [T, (value: T) => void];
/**
 * React hook for managing multiple URL query parameters together.
 * Updates are batched into a single history entry.
 *
 * @param params - Object mapping keys to Param types
 * @param push - Use pushState (true) or replaceState (false) when updating
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useUrlParams({
 *   zoom: boolParam,
 *   device: stringParam('default'),
 *   count: intParam(10)
 * })
 *
 * // Update multiple params at once
 * setValues({ zoom: true, count: 20 })
 * ```
 */
declare function useUrlParams<P extends Record<string, Param<any>>>(params: P, push?: boolean): {
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
 * @param key - Query parameter key
 * @param param - MultiParam encoder/decoder
 * @param push - Use pushState (true) or replaceState (false) when updating
 * @returns Tuple of [value, setValue]
 *
 * @example
 * ```tsx
 * const [tags, setTags] = useMultiUrlParam('tag', multiStringParam())
 * // URL: ?tag=a&tag=b → tags = ['a', 'b']
 * ```
 */
declare function useMultiUrlParam<T>(key: string, param: MultiParam<T>, push?: boolean): [T, (value: T) => void];
/**
 * React hook for managing multiple multi-value URL parameters together.
 * Updates are batched into a single history entry.
 *
 * @param params - Object mapping keys to MultiParam types
 * @param push - Use pushState (true) or replaceState (false) when updating
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useMultiUrlParams({
 *   tags: multiStringParam(),
 *   ids: multiIntParam()
 * })
 *
 * // Update multiple multi-value params at once
 * setValues({ tags: ['a', 'b'], ids: [1, 2, 3] })
 * ```
 */
declare function useMultiUrlParams<P extends Record<string, MultiParam<any>>>(params: P, push?: boolean): {
    values: {
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    };
    setValues: (updates: Partial<{
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    }>) => void;
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

export { type CodeMap, type Encoded, type LocationStrategy, type MultiEncoded, type MultiParam, type Pagination, type Param, boolParam, clearParams, codeParam, codesParam, defStringParam, enumParam, floatParam, getCurrentParams, getDefaultStrategy, hashStrategy, intParam, multiFloatParam, multiIntParam, multiStringParam, notifyLocationChange, numberArrayParam, optIntParam, paginationParam, parseMultiParams, parseParams, queryStrategy, serializeMultiParams, serializeParams, setDefaultStrategy, stringParam, stringsParam, updateUrl, useMultiUrlParam, useMultiUrlParams, useUrlParam, useUrlParams };
