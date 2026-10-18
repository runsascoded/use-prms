import { ParamDiagnostic, ParamDescribe, Params, UrlDiagnostics, CleanUrlPolicy, Param, MultiParam, ParamRegistration, StrategyName } from './core.cjs';
export { ALPHABETS, Alphabet, AlphabetName, BASE64_CHARS, BBox, BBoxParamOptions, Base64Options, BinaryParamOptions, BitBuffer, CodeMap, DEFAULT_TAG_CYCLE, DateOrGetter, DatesParamOptions, DeprecatedInfo, DeprecatedMigration, DeprecatedSpec, Encoded, FixedPoint, FlagPackSpec, FlagPackValues, Float, FloatEncoding, FloatParamOptions, InspectUrlOptions, KeyedDiagnostic, LLZ, LLZParamOptions, LocationStrategy, MultiCodec, MultiEncoded, NumberFieldEncoding, NumberPath, NumberTupleField, NumberTupleParamOptions, PRECISION_SCHEMES, Pagination, ParamValues, Point, PointParamOptions, PrecisionScheme, RegisterInput, TagDefaults, TagFilterParamOptions, TagFilters, TagPrefixes, TagState, UrlBinding, ViewState, ViewStateParamOptions, WriteOptions, __resetRegistry, base64Decode, base64Encode, base64FloatParam, base64Param, bboxParam, binaryParam, boolParam, bytesToFloat, catalogueRegistrations, classifyParam, cleanUrl, clearParams, codeParam, codesParam, createLookupMap, cycleTagFilter, datesParam, decodeDates, defStringParam, describeParams, effectiveTagState, encodeDates, encodeFloatAllModes, encodePointAllModes, enumParam, flagPackParam, floatParam, floatToBytes, formatSignedParts, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, getServerSnapshot, getUrlSnapshot, hashStrategy, inspectUrl, intParam, liveRegistrations, llzParam, multiCodec, multiFloatParam, multiIntParam, multiStringParam, multiToSingle, notifyLocationChange, numberArrayParam, numberTupleParam, onRegistryChange, optFloatParam, optIntParam, paginationParam, parseMultiParams, parseParams, parseSignedParts, pointParam, PRECISION_SCHEMES as precisionSchemes, queryStrategy, registerParam, resolveAlphabet, resolvePrecision, runPassesTagFilters, serializeMultiParams, serializeParams, setDefaultStrategy, singleToMulti, strategyName, stringParam, stringsParam, tagFilterParam, toFixedPoint, toFloat, toMultiCodec, updateUrl, validateAlphabet, viewStateParam, writeParams } from './core.cjs';

/**
 * React bindings for URL-parameter state.
 *
 * Thin adapters over the framework-free `UrlBinding` (see `store.ts`): each
 * hook owns a binding for the component's lifetime, feeds it the live codecs +
 * options each render, reads values through `useSyncExternalStore`, and keeps
 * the reflection-registry + diagnostics plumbing (which is React-specific) in
 * this layer. The Vue binding reuses the same `UrlBinding` with Vue reactivity.
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
 * @returns Tuple of [value, setValue, diagnostic]
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

export { type AliasConflictMode, type AliasInput, type AliasMergeResult, CleanUrlPolicy, MultiParam, Param, ParamDescribe, ParamDiagnostic, type ParamReflection, ParamRegistration, Params, type ReflectOptions, StrategyName, type UnknownParam, UrlDiagnostics, type UseUrlStateOptions, type UseUrlStatesOptions, onReflectionChange, reflectParams, reflectUnknown, useMultiUrlState, useMultiUrlStates, useParamReflection, useUrlAlias, useUrlState, useUrlStates };
