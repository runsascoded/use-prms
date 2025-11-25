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
 * React hook for managing URL query parameters
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
 * const [zoom, setZoom] = useUrlParam('z', boolParam())
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
 *   zoom: boolParam(),
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
 */
declare function serializeParams(params: Record<string, Encoded>): string;
/**
 * Parse query parameters from URL string or URLSearchParams.
 * Note: URLSearchParams treats ?z and ?z= identically (both as empty string).
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

export { type Encoded, type Param, boolParam, defStringParam, enumParam, floatParam, getCurrentParams, intParam, numberArrayParam, optIntParam, parseParams, serializeParams, stringParam, stringsParam, updateUrl, useUrlParam, useUrlParams };
