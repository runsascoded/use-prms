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
 * A module-level registry of the params a running app has mounted, so a
 * host can reflect on its own URL — what each key means, which keys it
 * would honour, why a stale link decodes differently — without the
 * library dictating any UI. See `reflection.ts` for the read side.
 *
 * The registry is deliberately framework-agnostic (a `Map` plus a
 * listener set): the React hooks call `registerParam` on mount and the
 * returned disposer on unmount, but nothing here imports React.
 */

type StrategyName = 'query' | 'hash';
/** Map a live `LocationStrategy` to its reflection name. */
declare function strategyName(strategy: LocationStrategy): StrategyName;
/** Human copy a caller attaches to a param via the `describe` hook option. */
interface ParamDescribe {
    /** Short label, e.g. "Diff window". Falls back to the key when absent. */
    label?: string;
    /** Longer copy. `string` in the pure layer; a host may pass a ReactNode. */
    description?: unknown;
    /** Example encodings a host can show, e.g. `['260916-2001-1d']`. */
    examples?: string[];
}
/** What a mounted hook (or a `describeParams` catalogue entry) registers. */
interface ParamRegistration extends ParamDescribe {
    /** Primary URL key (the canonical key, for an alias). */
    key: string;
    /** Every URL key this entry claims — one, except aliases claim all. */
    keys: string[];
    strategy: StrategyName;
    /** Encoder/decoder for canonical forms and classification. */
    param: Param<unknown>;
    /** Per-key decoders for an alias entry (canonical + alias keys). */
    aliasParams?: Record<string, Param<unknown>>;
    /** True for `useMultiUrlState` (repeated-key) params. */
    multi: boolean;
    /** `param.encode(param.decode(undefined))` — the "currently default" form. */
    defaultEncoded: Encoded;
    /** Mount count — the same key may be read by several components. */
    refs: number;
}
/** Arguments to {@link registerParam}. */
interface RegisterInput extends ParamDescribe {
    key: string;
    keys?: string[];
    strategy: StrategyName;
    param: Param<unknown>;
    aliasParams?: Record<string, Param<unknown>>;
    multi?: boolean;
}
/** Subscribe to registry mutations (register / unregister / describeParams). */
declare function onRegistryChange(cb: () => void): () => void;
/**
 * Register a mounted param. Returns a disposer to call on unmount.
 *
 * The same `(strategy, key)` registered by several components ref-counts:
 * the first registration's `param` and metadata are kept (a stable
 * identity for the key), and later registrations only bump `refs`. The
 * disposer is idempotent and drops the entry when `refs` hits zero.
 */
declare function registerParam(input: RegisterInput): () => void;
/**
 * Register descriptive metadata for keys with no mounted hook — a
 * whole-app catalogue. Entries reflect with `refs: 0` and are merged
 * under any live registration of the same key (the live entry wins;
 * catalogue fills in metadata the hook didn't supply). Pass a `param`
 * for a dormant entry to still classify against the URL.
 *
 * Returns a disposer that removes the entries it added.
 */
declare function describeParams(entries: Record<string, ParamDescribe & {
    param?: Param<unknown>;
    multi?: boolean;
}>, opts?: {
    strategy?: StrategyName;
}): () => void;
/** Snapshot of all live registrations for a strategy (or all strategies). */
declare function liveRegistrations(strategy?: StrategyName): ParamRegistration[];
/** Snapshot of all catalogue entries for a strategy (or all strategies). */
declare function catalogueRegistrations(strategy?: StrategyName): ParamRegistration[];
/** Test-only: drop every live and catalogue registration. */
declare function __resetRegistry(): void;

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
    /**
     * Human copy attached to this param in the reflection registry
     * (`reflectParams` / `useParamReflection`). Purely descriptive — it
     * doesn't affect encoding.
     */
    describe?: ParamDescribe;
}
/**
 * Options for `useUrlStates` (multi-key) — extends single-key options with
 * URL-level reporting and cleanup.
 */
interface UseUrlStatesOptions<P extends Params = Params> extends Omit<UseUrlStateOptions, 'onDiagnostic' | 'describe'> {
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
    /**
     * Per-key human copy for the reflection registry. Keys not listed still
     * register (label falls back to the key).
     */
    describe?: Partial<Record<keyof P, ParamDescribe>>;
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
 * `useUrlAlias`: one logical value sourced from N URL keys, with a
 * designated *canonical* key for writes. Reads each alias key via its own
 * `Param<T | undefined>`, hands the decoded values to a user-supplied
 * `merge` function, and on first render rewrites the URL into canonical
 * form (canonical key only, aliases stripped).
 *
 * The prototypical case is ELvis's `?m=mp-2375705` (canonical) /
 * `?mp=2375705` (shorthand) pair: both resolve to the same internal
 * `materialId`, and the URL should normalize to `?m=…` on mount so shared
 * links are predictable.
 *
 * `merge` decides resolution. Return a value (or `undefined`) to adopt
 * it; return (or throw) an `Error` to signal a conflict — `onConflict`
 * controls what happens next (default: warn + adopt the canonical key's
 * decoded value).
 */

/** Result returned by an `AliasInput<T>['merge']` callback. */
type AliasMergeResult<T> = T | undefined | Error;
/** Mode for handling a merge-conflict `Error`. */
type AliasConflictMode = 'warn' | 'throw' | ((err: Error) => void);
interface AliasInput<T> {
    /**
     * Ordered list of URL keys. Index 0 is the *canonical* write target;
     * later entries are aliases (read-only).
     */
    keys: readonly [string, ...string[]];
    /**
     * Per-key decoder. Maps each entry in `keys` to a `Param<T | undefined>`
     * so an absent key reads as `undefined`. Different aliases can use
     * different decoders (e.g. canonical `m` decodes `'mp-2375705'`
     * unchanged; alias `mp` decodes `'2375705'` → `'mp-2375705'`).
     */
    params: Record<string, Param<T | undefined>>;
    /**
     * Merge raw decoded values into the resolved state. Receives a record
     * keyed by every entry in `keys` (each value is the decoded result, or
     * `undefined` if the key is absent). Return the resolved value, or
     * return/throw an `Error` to signal a conflict; see `onConflict`.
     */
    merge: (vals: Record<string, T | undefined>) => AliasMergeResult<T>;
    /**
     * What to do when `merge` returns/throws an `Error`.
     * - `'warn'` *(default)*: `console.warn` the message, then adopt the
     *   canonical key's decoded value.
     * - `'throw'`: rethrow.
     * - `function`: invoked with the error; afterwards we adopt the
     *   canonical key's decoded value.
     */
    onConflict?: AliasConflictMode;
    /**
     * If `true` *(default)*, on first render strip every non-canonical
     * alias key and re-write the canonical key from the resolved value.
     * Set `false` to leave the URL alone (aliases are still resolved on
     * subsequent navigations).
     */
    canonicalizeOnMount?: boolean;
    /**
     * Human copy for the reflection registry. The alias registers as one
     * entry keyed by the canonical key, claiming every key in `keys`.
     */
    describe?: ParamDescribe;
}
/**
 * React hook for managing one logical value sourced from multiple URL
 * keys. See {@link AliasInput} for the full options shape.
 *
 * Returns `[value, setValue]`. `setValue` always writes to `keys[0]`
 * (the canonical key) and strips every alias key from the URL.
 *
 * @example
 * ```tsx
 * type MatId = string
 * const [materialId, setMaterialId] = useUrlAlias<MatId>({
 *   keys: ['m', 'mp'] as const,
 *   params: {
 *     m: stringParam(),
 *     mp: {
 *       encode: v => v ? v.slice(3) : undefined,
 *       decode: v => v ? `mp-${v}` : undefined,
 *     },
 *   },
 *   merge: ({ m, mp }) => {
 *     if (m && mp && m !== mp) return new Error(`m=${m} vs mp=${mp}`)
 *     return m ?? mp
 *   },
 * })
 * // `?mp=2375705` → URL becomes `?m=mp-2375705`, materialId === 'mp-2375705'
 * ```
 */
declare function useUrlAlias<T>(input: AliasInput<T>): [T | undefined, (v: T | undefined) => void];

/**
 * `flagPackParam`: collapse N boolean flags into one URL key. Each entry
 * in the spec is `<letter>: <default>`; the encoded value lists only the
 * letters whose current state differs from their default, in spec-declared
 * order. So `?_=` is omitted entirely when every flag is at its default.
 *
 * @example
 * ```ts
 * const flagsParam = flagPackParam({ Z: true, H: true, A: true })
 * const [flags, setFlags] = useUrlState('_', flagsParam)
 * // ?_=Z → { Z: false, H: true, A: true }
 * // ?_=ZA → { Z: false, H: true, A: false }  (declaration order)
 * // ?    → { Z: true,  H: true, A: true }    (all default)
 * ```
 *
 * Decode is lenient: out-of-order tokens (`?_=AZ`), duplicates (`?_=ZZ`),
 * and unknown letters all parse without throwing — they round-trip through
 * `cleanUrl({ stale: 'normalize' })` to the canonical spec-declared form.
 */

/** Spec describing a flag pack: `<letter>: <default value>` map. */
type FlagPackSpec = Record<string, boolean>;
/** Flag-record type derived from a {@link FlagPackSpec}. */
type FlagPackValues<S extends FlagPackSpec> = {
    [K in keyof S]: boolean;
};
/**
 * Create a {@link Param} that packs `spec`'s flags into one URL token.
 * Encode emits the letters whose current state differs from their default,
 * in declaration order. Decode parses the same format (lenient on order,
 * dupes, and unknown letters).
 */
declare function flagPackParam<S extends FlagPackSpec>(spec: S): Param<FlagPackValues<S>>;

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
 * `datesParam`: a set of ISO dates in a URL, contracted to runs.
 *
 * The naive encoding of a week is ~90 chars of mostly redundant digits
 * (`?c=2026-08-18%2C…%2C2026-08-24`); this says the same in 9
 * (`?c=260818-24`). Three compressions, in order of how much they buy:
 *
 * 1. **Runs contract.** Calendar-consecutive days collapse to `start-end`.
 *    A week costs one token regardless of its length — and a week is the
 *    common case.
 * 2. **Digits are inherited.** Each token drops the leading digits it
 *    shares with the one before it: `260731 0805 24-25` is Jul 31, Aug 5,
 *    Aug 24–25 of 2026. A token is 2 (day), 4 (month-day), 6 (2-digit
 *    year), or 8 digits (full year, escape hatch for outside 2000–2099).
 *    The first token is never abbreviated.
 * 3. **The separator is a space.** `URLSearchParams` writes it as `+` and
 *    reads it back as a space, so the URL bar shows `?c=260731+0805+24-25`
 *    with nothing escaped. Decode also accepts a literal `+`, in case
 *    something hands the raw query string over un-decoded.
 *
 * Canonical form is sorted ascending and deduped — a URL is a cache key
 * and a thing people diff by eye. Empty set ⇒ `undefined` (param absent).
 *
 * Decoding is deliberately lenient: an unparseable token is skipped, not
 * thrown. This is a hand-editable URL and a typo should cost one day's
 * state rather than white-screening the page.
 *
 * ## Half-open ranges
 *
 * Pass `latest` and/or `genesis` to make ranges that touch the domain's
 * ends drop that end from the URL:
 *
 * - `latest`: a run whose *end* matches it encodes as `start-` (trailing
 *   dash). `?c=260818-` = "Aug 18 through today", and "today" is resolved
 *   fresh on every decode — so the URL keeps meaning "through today" as
 *   the calendar moves.
 * - `genesis`: a run whose *start* matches it encodes as `-end` (leading
 *   dash). `?c=-260824` = "from the beginning of the domain through Aug
 *   24".
 *
 * Both accept a `string` (fixed) or a `() => string` (resolved lazily on
 * each encode/decode). Encoded strings written without a matching option
 * decode to nothing — a half-open token with no anchor is a lenient
 * skip, same as any other malformed token.
 *
 * Single-day selections that land on `latest` or `genesis` still encode
 * as a single date (`260826`), never as `260826-` or `-260826` — a
 * lone-dash suffix on a single day would just be noise.
 *
 * The 6-digit `YYMMDD` form is a Y2K-shaped decision: it hard-codes the
 * 21st century. Dates outside 2000–2099 fall back to the 8-digit form
 * (`19991231 21000101`) — that path is untested by daily use, so treat it
 * as the escape hatch it is.
 *
 * Values are ISO `YYYY-MM-DD` strings, not `Date`s: `Date` is a timestamp
 * and a selected *day* is not one — round-tripping through `Date` invites
 * exactly the local-vs-UTC bug this param exists to avoid. Consumers who
 * want `Date`s can map.
 */

/**
 * A fixed ISO date, or a `() => ISO date` that's resolved lazily on every
 * encode/decode. Use the callback form when the anchor should track
 * "now" — e.g. `latest: () => new Date().toISOString().slice(0, 10)`.
 */
type DateOrGetter = string | (() => string);
interface DatesParamOptions {
    /**
     * If set, a run whose end matches this date encodes as `start-`, and a
     * `D-` token on decode expands to a range ending here.
     */
    latest?: DateOrGetter;
    /**
     * If set, a run whose start matches this date encodes as `-end`, and a
     * `-D` token on decode expands to a range starting here.
     */
    genesis?: DateOrGetter;
}
/**
 * Encode a set of ISO dates. Sorted ascending, deduped, invalid entries
 * dropped. Empty result → `undefined` (param absent from the URL).
 *
 * With `options.latest` or `options.genesis`, runs whose end or start
 * matches contract to `start-` or `-end` respectively; the `latest` form
 * is preferred when both would apply. Single-day runs are never
 * half-open — a lone day at the boundary stays as its own date.
 */
declare function encodeDates(dates: readonly string[], options?: DatesParamOptions): string | undefined;
/**
 * Decode a `datesParam` string to an ascending, deduped array of ISO
 * dates. Malformed tokens (unparseable, invalid calendar date, backwards
 * range, half-open with no matching anchor) are skipped rather than
 * thrown. Accepts both `' '` and `'+'` as separators.
 */
declare function decodeDates(encoded: string | undefined, options?: DatesParamOptions): string[];
/**
 * `use-prms` `Param` for a set of ISO dates. See module docs for the
 * encoding.
 *
 * @example
 * ```ts
 * const [dates, setDates] = useUrlState('c', datesParam())
 * // ?c=260818-24 → ['2026-08-18', ..., '2026-08-24']
 *
 * // With half-open anchors:
 * const today = () => new Date().toISOString().slice(0, 10)
 * const [dates, setDates] = useUrlState('c', datesParam({ latest: today }))
 * // ?c=260818- → Aug 18 through today (resolved on every decode)
 * ```
 */
declare function datesParam(options?: DatesParamOptions): Param<string[]>;

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
 * `tagFilterParam`: tri-state tag filter (in / out / off) with per-tag
 * defaults. URL encoding uses sign-prefix tokens — `'in'` bare, `'out'`
 * `-`-prefixed, `'off'` `~`-prefixed — joined by spaces (which
 * `URLSearchParams` encodes as `+`). Mirrors the sign-as-delim convention
 * `numberTupleParam` uses for signed numbers.
 *
 * Only *overrides* of per-tag defaults are encoded, so clean URLs stay
 * clean. Decoding is lenient: redundant entries that match the default
 * (or unknown tags) round-trip cleanly through `cleanUrl({ stale:
 * 'normalize' })`, but `decode` itself preserves them so callers can
 * detect/log non-canonical input via the diagnostics layer.
 */

/**
 * Per-tag filter state.
 * - `'in'`: items must have this tag
 * - `'out'`: items must NOT have this tag
 * - `'off'`: no constraint (only ever stored as an *override* of a
 *           non-`off` default — see {@link cycleTagFilter})
 */
type TagState = 'in' | 'out' | 'off';
/**
 * Overrides-only map of tag → state. A tag absent from the Map is
 * implicitly at its per-tag default (see {@link TagDefaults}). Using a
 * `Map` (rather than `Record`) preserves insertion order, which keeps
 * URLs stable across user interactions.
 */
type TagFilters<T extends string = string> = Map<T, TagState>;
/**
 * Per-tag default state. Tags absent here implicitly default to `'off'`.
 */
type TagDefaults<T extends string = string> = Partial<Record<T, TagState>>;
/**
 * Token prefixes used in the URL encoding. Each must be distinct; `out`
 * and `off` must be non-empty (the `in` prefix may be empty so bare tags
 * read as `in`).
 */
interface TagPrefixes {
    /** Default: `''` (bare). */
    in?: string;
    /** Default: `'-'`. */
    out?: string;
    /** Default: `'~'`. */
    off?: string;
}
interface TagFilterParamOptions<T extends string> {
    /** Per-tag defaults. Tags not listed default to `'off'`. */
    defaults?: TagDefaults<T>;
    /** Override the default URL prefixes. */
    prefixes?: TagPrefixes;
}
/** Default cycle order used by {@link cycleTagFilter} when no explicit
 *  `cycle` is provided: `in → out → off → in`. */
declare const DEFAULT_TAG_CYCLE: readonly TagState[];
/**
 * Effective state for `tag`: the override if present in `filters`,
 * otherwise the per-tag default.
 */
declare function effectiveTagState<T extends string>(filters: TagFilters<T>, tag: T, defaults?: TagDefaults<T>): TagState;
/**
 * Apply the (overrides + defaults) tag filter to an item's tags.
 * Returns true iff every constrained tag's `in`/`out` rule is satisfied
 * (`off` tags impose no constraint). Iterates the union of `filters`
 * keys and `defaults` keys — both can carry constraints.
 */
declare function runPassesTagFilters<T extends string>(itemTags: readonly T[], filters: TagFilters<T>, defaults?: TagDefaults<T>): boolean;
/**
 * Advance `tag` one step around `cycle` (default `in → out → off → in`).
 * If the resulting state matches the tag's default, the entry is
 * *removed* from the Map (so the URL stays minimal). Returns a fresh
 * `Map`; never mutates the input.
 */
declare function cycleTagFilter<T extends string>(filters: TagFilters<T>, tag: T, defaults?: TagDefaults<T>, cycle?: readonly TagState[]): TagFilters<T>;
/**
 * Create a {@link Param} for tri-state tag filters. See module docs.
 *
 * @example
 * ```ts
 * type RunTag = 'CE' | 'EMD' | 'bunk'
 * const [filters, setFilters] = useUrlState(
 *   'tags',
 *   tagFilterParam<RunTag>({ defaults: { bunk: 'out' } }),
 * )
 * // ?tags=CE+~bunk → Map([['CE', 'in'], ['bunk', 'off']])
 * ```
 */
declare function tagFilterParam<T extends string>(options?: TagFilterParamOptions<T>): Param<TagFilters<T>>;

/**
 * Reflection: read the {@link registry} against the live URL so a host can
 * render what its params mean and how the current URL maps onto them. All
 * pure except {@link useParamReflection}, the React convenience wrapper.
 */

/** A registered param plus its live classification against the current URL. */
interface ParamReflection extends ParamRegistration {
    /** For an alias entry, which of `keys` the URL currently carries. */
    liveKey?: string;
    /** Classification of the URL value (as `classifyParam` / `UrlDiagnostics`). */
    state: 'absent' | 'canonical' | 'stale' | 'malformed';
    /** What the URL has (joined, for multi-value). */
    raw?: string;
    /** What it would normalize to, when `stale`/`malformed`. */
    canonical?: string;
    /** The decoded value. */
    value: unknown;
}
/** A URL key nothing registered, with its raw value. */
interface UnknownParam {
    key: string;
    raw: string;
}
interface ReflectOptions {
    /** Which strategy's params to reflect. Defaults to the active default. */
    strategy?: StrategyName;
}
/**
 * Every registered param for a strategy, each with its live classification.
 * A live hook and a `describeParams` catalogue entry for the same key merge
 * (the live entry wins; the catalogue fills in metadata it lacks).
 */
declare function reflectParams(opts?: ReflectOptions): ParamReflection[];
/** The URL's keys nothing registered (query or catalogue), with raw values. */
declare function reflectUnknown(opts?: ReflectOptions): UnknownParam[];
/** Subscribe to registry mutations and URL navigations. */
declare function onReflectionChange(cb: () => void): () => void;
/**
 * React hook: the reflection of registered params + unknown keys,
 * re-rendering on hook mount/unmount and on URL navigation. Reads the
 * registry only — it never registers a param itself.
 */
declare function useParamReflection(opts?: ReflectOptions): {
    params: ParamReflection[];
    unknown: UnknownParam[];
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

export { ALPHABETS, type AliasConflictMode, type AliasInput, type AliasMergeResult, type Alphabet, type AlphabetName, BASE64_CHARS, type BBox, type BBoxParamOptions, type Base64Options, type BinaryParamOptions, BitBuffer, type CleanUrlPolicy, type CodeMap, DEFAULT_TAG_CYCLE, type DateOrGetter, type DatesParamOptions, type DeprecatedInfo, type DeprecatedMigration, type DeprecatedSpec, type Encoded, type FixedPoint, type FlagPackSpec, type FlagPackValues, type Float, type FloatEncoding, type FloatParamOptions, type InspectUrlOptions, type KeyedDiagnostic, type LLZ, type LLZParamOptions, type LocationStrategy, type MultiEncoded, type MultiParam, type NumberFieldEncoding, type NumberPath, type NumberTupleField, type NumberTupleParamOptions, precisionSchemes as PRECISION_SCHEMES, type Pagination, type Param, type ParamDescribe, type ParamDiagnostic, type ParamReflection, type ParamRegistration, type ParamValues, type Params, type Point, type PointParamOptions, type PrecisionScheme, type ReflectOptions, type RegisterInput, type StrategyName, type TagDefaults, type TagFilterParamOptions, type TagFilters, type TagPrefixes, type TagState, type UnknownParam, type UrlDiagnostics, type UseUrlStateOptions, type UseUrlStatesOptions, type ViewState, type ViewStateParamOptions, __resetRegistry, base64Decode, base64Encode, base64FloatParam, base64Param, bboxParam, binaryParam, boolParam, bytesToFloat, catalogueRegistrations, classifyParam, cleanUrl, clearParams, codeParam, codesParam, createLookupMap, cycleTagFilter, datesParam, decodeDates, defStringParam, describeParams, effectiveTagState, encodeDates, encodeFloatAllModes, encodePointAllModes, enumParam, flagPackParam, floatParam, floatToBytes, formatSignedParts, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, hashStrategy, inspectUrl, intParam, liveRegistrations, llzParam, multiFloatParam, multiIntParam, multiStringParam, notifyLocationChange, numberArrayParam, numberTupleParam, onReflectionChange, onRegistryChange, optFloatParam, optIntParam, paginationParam, parseMultiParams, parseParams, parseSignedParts, pointParam, precisionSchemes, queryStrategy, reflectParams, reflectUnknown, registerParam, resolveAlphabet, resolvePrecision, runPassesTagFilters, serializeMultiParams, serializeParams, setDefaultStrategy, strategyName, stringParam, stringsParam, tagFilterParam, toFixedPoint, toFloat, updateUrl, useMultiUrlState, useMultiUrlStates, useParamReflection, useUrlAlias, useUrlState, useUrlStates, validateAlphabet, viewStateParam };
