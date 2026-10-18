import { Ref } from 'vue';
import { Param, MultiParam } from './core.cjs';
export { ALPHABETS, Alphabet, AlphabetName, BASE64_CHARS, BBox, BBoxParamOptions, Base64Options, BinaryParamOptions, BitBuffer, CleanUrlPolicy, CodeMap, DEFAULT_TAG_CYCLE, DateOrGetter, DatesParamOptions, DeprecatedInfo, DeprecatedMigration, DeprecatedSpec, Encoded, FixedPoint, FlagPackSpec, FlagPackValues, Float, FloatEncoding, FloatParamOptions, InspectUrlOptions, KeyedDiagnostic, LLZ, LLZParamOptions, LocationStrategy, MultiCodec, MultiEncoded, NumberFieldEncoding, NumberPath, NumberTupleField, NumberTupleParamOptions, PRECISION_SCHEMES, Pagination, ParamDescribe, ParamDiagnostic, ParamRegistration, ParamValues, Params, Point, PointParamOptions, PrecisionScheme, RegisterInput, StrategyName, TagDefaults, TagFilterParamOptions, TagFilters, TagPrefixes, TagState, UrlBinding, UrlDiagnostics, ViewState, ViewStateParamOptions, WriteOptions, __resetRegistry, base64Decode, base64Encode, base64FloatParam, base64Param, bboxParam, binaryParam, boolParam, bytesToFloat, catalogueRegistrations, classifyParam, cleanUrl, clearParams, codeParam, codesParam, createLookupMap, cycleTagFilter, datesParam, decodeDates, defStringParam, describeParams, effectiveTagState, encodeDates, encodeFloatAllModes, encodePointAllModes, enumParam, flagPackParam, floatParam, floatToBytes, formatSignedParts, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, getServerSnapshot, getUrlSnapshot, hashStrategy, inspectUrl, intParam, liveRegistrations, llzParam, multiCodec, multiFloatParam, multiIntParam, multiStringParam, multiToSingle, notifyLocationChange, numberArrayParam, numberTupleParam, onRegistryChange, optFloatParam, optIntParam, paginationParam, parseMultiParams, parseParams, parseSignedParts, pointParam, PRECISION_SCHEMES as precisionSchemes, queryStrategy, registerParam, resolveAlphabet, resolvePrecision, runPassesTagFilters, serializeMultiParams, serializeParams, setDefaultStrategy, singleToMulti, strategyName, stringParam, stringsParam, tagFilterParam, toFixedPoint, toFloat, toMultiCodec, updateUrl, validateAlphabet, viewStateParam, writeParams } from './core.cjs';

/**
 * `use-prms/vue` — Vue 3 bindings for URL-parameter state.
 *
 * Thin adapters over the same framework-free `UrlBinding` the React hooks use
 * (see `store.ts`), so a React app and a Vue app produce byte-identical query
 * strings for identical state. Each composable owns a binding for the calling
 * component's lifetime, subscribes to URL changes, and tears both down via
 * `onScopeDispose`.
 *
 * - `useUrlState` / `useMultiUrlState` return a writable `Ref` (v-model-able).
 * - `useUrlStates` / `useMultiUrlStates` return `{ values, setValues }`, where
 *   `values` is a `reactive` object (so `v-model="values.zoom"` works) and
 *   `setValues` writes several keys in one history entry.
 */

/** Options shared by all Vue URL-state composables. */
interface UseUrlStateOptions {
    /** Debounce URL writes in milliseconds (state updates immediately). */
    debounce?: number;
    /** Use `pushState` (true) or `replaceState` (false, default). */
    push?: boolean;
}
/**
 * Manage a single URL query parameter as a writable `Ref`.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useUrlState, boolParam } from 'use-prms/vue'
 * const zoom = useUrlState('z', boolParam)
 * </script>
 * <template><input type="checkbox" v-model="zoom" /></template>
 * ```
 */
declare function useUrlState<T>(key: string, param: Param<T>, options?: UseUrlStateOptions | boolean): Ref<T>;
/**
 * Manage a single multi-value URL parameter (repeated `?tag=a&tag=b`) as a
 * writable `Ref`.
 */
declare function useMultiUrlState<T>(key: string, param: MultiParam<T>, options?: UseUrlStateOptions | boolean): Ref<T>;
/**
 * Manage several single-value URL parameters together. Returns `values` (a
 * `reactive` object, two-way per key) and `setValues` (batched into one
 * history entry).
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
 * Manage several multi-value URL parameters together. Returns `values` (a
 * `reactive` object, two-way per key) and `setValues` (batched).
 */
declare function useMultiUrlStates<P extends Record<string, MultiParam<any>>>(params: P, options?: UseUrlStateOptions | boolean): {
    values: {
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    };
    setValues: (updates: Partial<{
        [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never;
    }>) => void;
};

export { MultiParam, Param, type UseUrlStateOptions, useMultiUrlState, useMultiUrlStates, useUrlState, useUrlStates };
