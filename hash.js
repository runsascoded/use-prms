import { useRef, useSyncExternalStore, useCallback, useEffect } from 'react';

// src/core.ts
function parseMultiParams(source) {
  const searchParams = typeof source === "string" ? new URLSearchParams(source) : source;
  const result = {};
  const keys = new Set(searchParams.keys());
  for (const key of keys) {
    result[key] = searchParams.getAll(key);
  }
  return result;
}
function serializeMultiParams(params) {
  const searchParams = new URLSearchParams();
  for (const [key, values] of Object.entries(params)) {
    for (const value of values) {
      if (value === "") {
        continue;
      }
      searchParams.append(key, value);
    }
  }
  let result = searchParams.toString();
  const valuelessKeys = Object.entries(params).filter(([_, values]) => values.includes("")).map(([key, _]) => encodeURIComponent(key));
  if (valuelessKeys.length > 0) {
    const valuelessPart = valuelessKeys.join("&");
    result = result ? `${result}&${valuelessPart}` : valuelessPart;
  }
  return result;
}
var LOCATION_CHANGE_EVENT = "use-prms:locationchange";
var historyPatched = false;
function patchHistoryApi() {
  if (typeof window === "undefined" || historyPatched) return;
  historyPatched = true;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function(state, title, url) {
    originalPushState(state, title, url);
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  };
  history.replaceState = function(state, title, url) {
    originalReplaceState(state, title, url);
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  };
}
patchHistoryApi();
var queryStrategy = {
  getRaw() {
    if (typeof window === "undefined") return "";
    return window.location.search;
  },
  parse() {
    if (typeof window === "undefined") return {};
    return parseMultiParams(window.location.search);
  },
  buildUrl(base, params) {
    base.search = serializeMultiParams(params);
    return base.toString();
  },
  subscribe(callback) {
    if (typeof window === "undefined") return () => {
    };
    window.addEventListener("popstate", callback);
    window.addEventListener(LOCATION_CHANGE_EVENT, callback);
    return () => {
      window.removeEventListener("popstate", callback);
      window.removeEventListener(LOCATION_CHANGE_EVENT, callback);
    };
  }
};
var hashStrategy = {
  getRaw() {
    if (typeof window === "undefined") return "";
    return window.location.hash;
  },
  parse() {
    if (typeof window === "undefined") return {};
    const hash = window.location.hash;
    const hashString = hash.startsWith("#") ? hash.slice(1) : hash;
    return parseMultiParams(hashString);
  },
  buildUrl(base, params) {
    base.hash = serializeMultiParams(params);
    return base.toString();
  },
  subscribe(callback) {
    if (typeof window === "undefined") return () => {
    };
    window.addEventListener("hashchange", callback);
    window.addEventListener("popstate", callback);
    window.addEventListener(LOCATION_CHANGE_EVENT, callback);
    return () => {
      window.removeEventListener("hashchange", callback);
      window.removeEventListener("popstate", callback);
      window.removeEventListener(LOCATION_CHANGE_EVENT, callback);
    };
  }
};
function notifyLocationChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
}
function clearParams(strategy = "query") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (strategy === "hash") {
    url.hash = "";
  } else {
    url.search = "";
  }
  window.history.replaceState({}, "", url.toString());
}
var defaultStrategy = queryStrategy;
function getDefaultStrategy() {
  return defaultStrategy;
}
function setDefaultStrategy(strategy) {
  defaultStrategy = strategy;
}

// src/params.ts
function stringParam(init) {
  return {
    encode: (value) => value === init ? void 0 : value,
    decode: (encoded) => encoded === void 0 ? init : encoded
  };
}
function defStringParam(init) {
  return {
    encode: (value) => value === init ? void 0 : value,
    decode: (encoded) => encoded ?? init
  };
}
var boolParam = {
  encode: (value) => value ? "" : void 0,
  decode: (encoded) => encoded !== void 0
};
function intParam(init) {
  return {
    encode: (value) => value === init ? void 0 : value.toString(),
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return init;
      const parsed = parseInt(encoded, 10);
      return isNaN(parsed) ? init : parsed;
    }
  };
}
var optIntParam = {
  encode: (value) => value === null ? void 0 : value.toString(),
  decode: (encoded) => {
    if (encoded === void 0 || encoded === "") return null;
    const parsed = parseInt(encoded, 10);
    return isNaN(parsed) ? null : parsed;
  }
};
function enumParam(init, values) {
  const validSet = new Set(values);
  return {
    encode: (value) => {
      if (!validSet.has(value)) {
        console.warn(`Invalid enum value: ${value}, expected one of ${values.join(", ")}`);
        return void 0;
      }
      return value === init ? void 0 : value;
    },
    decode: (encoded) => {
      if (encoded === void 0) return init;
      if (!validSet.has(encoded)) {
        console.warn(`Invalid enum value: ${encoded}, expected one of ${values.join(", ")}. Using default: ${init}`);
        return init;
      }
      return encoded;
    }
  };
}
function stringsParam(init = [], delimiter = " ") {
  const initEncoded = init.join(delimiter);
  return {
    encode: (values) => {
      const encoded = values.join(delimiter);
      if (encoded === initEncoded) return void 0;
      return encoded;
    },
    decode: (encoded) => {
      if (encoded === void 0) return init;
      if (encoded === "") return [];
      return encoded.split(delimiter);
    }
  };
}
function numberArrayParam(init = []) {
  const isEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    encode: (values) => {
      if (isEqual(values, init)) return void 0;
      return values.map((v) => v.toString()).join(",");
    },
    decode: (encoded) => {
      if (encoded === void 0) return init;
      if (encoded === "") return [];
      return encoded.split(",").map((v) => parseFloat(v));
    }
  };
}
function paginationParam(defaultPageSize, validPageSizes) {
  return {
    encode: ({ offset, pageSize }) => {
      if (offset === 0 && pageSize === defaultPageSize) return void 0;
      if (offset === 0) return ` ${pageSize}`;
      if (pageSize === defaultPageSize) return String(offset);
      return `${offset} ${pageSize}`;
    },
    decode: (encoded) => {
      if (!encoded) return { offset: 0, pageSize: defaultPageSize };
      const parts = encoded.split(" ");
      const offset = parts[0] === "" ? 0 : parseInt(parts[0], 10) || 0;
      let pageSize = parts[1] ? parseInt(parts[1], 10) : defaultPageSize;
      if (validPageSizes && !validPageSizes.includes(pageSize)) {
        pageSize = defaultPageSize;
      }
      return { offset, pageSize };
    }
  };
}
function normalizeCodeMap(codeMap) {
  if (Array.isArray(codeMap)) return codeMap;
  return Object.entries(codeMap);
}
function codeParam(init, codeMap) {
  const entries = normalizeCodeMap(codeMap);
  const valueToCode = new Map(entries);
  const codeToValue = new Map(entries.map(([v, c]) => [c, v]));
  return {
    encode: (value) => {
      if (value === init) return void 0;
      return valueToCode.get(value) ?? value;
    },
    decode: (encoded) => {
      if (encoded === void 0) return init;
      return codeToValue.get(encoded) ?? init;
    }
  };
}
function codesParam(allValues, codeMap, separator = "") {
  const entries = normalizeCodeMap(codeMap);
  const valueToCode = new Map(entries);
  const codeToValue = new Map(entries.map(([v, c]) => [c, v]));
  return {
    encode: (values) => {
      if (values.length === allValues.length && allValues.every((v) => values.includes(v))) {
        return void 0;
      }
      return values.map((v) => valueToCode.get(v) ?? v).join(separator);
    },
    decode: (encoded) => {
      if (encoded === void 0) return [...allValues];
      if (encoded === "") return [];
      const codes = separator ? encoded.split(separator) : encoded.split("");
      return codes.map((c) => codeToValue.get(c)).filter((v) => v !== void 0);
    }
  };
}

// src/multiParams.ts
function multiStringParam(init = []) {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return [];
      if (arraysEqual(values, init)) return [];
      return values;
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init;
      return encoded;
    }
  };
}
function multiIntParam(init = []) {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return [];
      if (arraysEqual(values, init)) return [];
      return values.map((v) => v.toString());
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init;
      return encoded.map((v) => parseInt(v, 10));
    }
  };
}
function multiFloatParam(init = []) {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return [];
      if (arraysEqual(values, init)) return [];
      return values.map((v) => v.toString());
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init;
      return encoded.map((v) => parseFloat(v));
    }
  };
}
function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function debounce(fn, ms) {
  let timeoutId = null;
  const debounced = ((...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, ms);
  });
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return debounced;
}
var snapshotCache = /* @__PURE__ */ new WeakMap();
function getSnapshot(strategy) {
  const raw = strategy.getRaw();
  const cached = snapshotCache.get(strategy);
  if (cached && cached.raw === raw) {
    return cached.snapshot;
  }
  const snapshot = strategy.parse();
  snapshotCache.set(strategy, { raw, snapshot });
  return snapshot;
}
function getServerSnapshot() {
  return {};
}
function multiToSingle(multi) {
  if (multi.length === 0) return void 0;
  return multi[0];
}
function useUrlState(key, param, options = {}) {
  const opts = typeof options === "boolean" ? { push: options } : options;
  const { debounce: debounceMs = 0, push = false } = opts;
  const strategy = getDefaultStrategy();
  const paramRef = useRef(param);
  paramRef.current = param;
  const lastWrittenRef = useRef(null);
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  );
  const encoded = multiToSingle(urlParams[key] ?? []);
  const cacheRef = useRef(null);
  let value;
  if (lastWrittenRef.current && lastWrittenRef.current.encoded === encoded) {
    value = lastWrittenRef.current.decoded;
  } else {
    if (cacheRef.current === null || cacheRef.current.encoded !== encoded || cacheRef.current.param !== param) {
      cacheRef.current = { encoded, param, decoded: param.decode(encoded) };
    }
    value = cacheRef.current.decoded;
    lastWrittenRef.current = null;
  }
  const writeToUrl = useCallback(
    (newValue, newEncoded) => {
      if (typeof window === "undefined") return;
      const currentParams = strategy.parse();
      if (newEncoded === void 0) {
        delete currentParams[key];
      } else {
        currentParams[key] = [newEncoded];
      }
      const url = new URL(window.location.href);
      const newUrl = strategy.buildUrl(url, currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", newUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [key, push, strategy]
  );
  const debouncedWriteRef = useRef(null);
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(writeToUrl, debounceMs);
    } else {
      debouncedWriteRef.current = null;
    }
    return () => {
      debouncedWriteRef.current?.cancel();
    };
  }, [debounceMs, writeToUrl]);
  const setValue = useCallback(
    (newValue) => {
      const newEncoded = paramRef.current.encode(newValue);
      lastWrittenRef.current = { encoded: newEncoded, decoded: newValue };
      if (debouncedWriteRef.current) {
        debouncedWriteRef.current(newValue, newEncoded);
      } else {
        writeToUrl(newValue, newEncoded);
      }
    },
    [writeToUrl]
  );
  return [value, setValue];
}
function useUrlStates(params, options = {}) {
  const opts = typeof options === "boolean" ? { push: options } : options;
  const { debounce: debounceMs = 0, push = false } = opts;
  const strategy = getDefaultStrategy();
  const lastWrittenRef = useRef({});
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  );
  const values = Object.fromEntries(
    Object.entries(params).map(([key, param]) => {
      const encoded = multiToSingle(urlParams[key] ?? []);
      const lastWritten = lastWrittenRef.current[key];
      if (lastWritten && lastWritten.encoded === encoded) {
        return [key, lastWritten.decoded];
      } else {
        const decoded = param.decode(encoded);
        delete lastWrittenRef.current[key];
        return [key, decoded];
      }
    })
  );
  const writeToUrl = useCallback(
    (updates) => {
      if (typeof window === "undefined") return;
      const currentParams = strategy.parse();
      for (const [key, { encoded }] of Object.entries(updates)) {
        if (encoded === void 0) {
          delete currentParams[key];
        } else {
          currentParams[key] = [encoded];
        }
      }
      const url = new URL(window.location.href);
      const newUrl = strategy.buildUrl(url, currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", newUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [push, strategy]
  );
  const debouncedWriteRef = useRef(null);
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(writeToUrl, debounceMs);
    } else {
      debouncedWriteRef.current = null;
    }
    return () => {
      debouncedWriteRef.current?.cancel();
    };
  }, [debounceMs, writeToUrl]);
  const setValues = useCallback(
    (updates) => {
      const encodedUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        const param = params[key];
        if (!param) continue;
        const encoded = param.encode(value);
        encodedUpdates[key] = { encoded, decoded: value };
        lastWrittenRef.current[key] = { encoded, decoded: value };
      }
      if (debouncedWriteRef.current) {
        debouncedWriteRef.current(encodedUpdates);
      } else {
        writeToUrl(encodedUpdates);
      }
    },
    [params, writeToUrl]
  );
  return { values, setValues };
}
function useMultiUrlState(key, param, options = {}) {
  const opts = typeof options === "boolean" ? { push: options } : options;
  const { debounce: debounceMs = 0, push = false } = opts;
  const strategy = getDefaultStrategy();
  const paramRef = useRef(param);
  paramRef.current = param;
  const lastWrittenRef = useRef(null);
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  );
  const encoded = urlParams[key] ?? [];
  let value;
  if (lastWrittenRef.current && arraysEqual2(lastWrittenRef.current.encoded, encoded)) {
    value = lastWrittenRef.current.decoded;
  } else {
    value = param.decode(encoded);
    lastWrittenRef.current = null;
  }
  const writeToUrl = useCallback(
    (newEncoded) => {
      if (typeof window === "undefined") return;
      const currentParams = strategy.parse();
      if (newEncoded.length === 0) {
        delete currentParams[key];
      } else {
        currentParams[key] = newEncoded;
      }
      const url = new URL(window.location.href);
      const newUrl = strategy.buildUrl(url, currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", newUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [key, push, strategy]
  );
  const debouncedWriteRef = useRef(null);
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(writeToUrl, debounceMs);
    } else {
      debouncedWriteRef.current = null;
    }
    return () => {
      debouncedWriteRef.current?.cancel();
    };
  }, [debounceMs, writeToUrl]);
  const setValue = useCallback(
    (newValue) => {
      const newEncoded = paramRef.current.encode(newValue);
      lastWrittenRef.current = { encoded: newEncoded, decoded: newValue };
      if (debouncedWriteRef.current) {
        debouncedWriteRef.current(newEncoded);
      } else {
        writeToUrl(newEncoded);
      }
    },
    [writeToUrl]
  );
  return [value, setValue];
}
function arraysEqual2(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function useMultiUrlStates(params, options = {}) {
  const opts = typeof options === "boolean" ? { push: options } : options;
  const { debounce: debounceMs = 0, push = false } = opts;
  const strategy = getDefaultStrategy();
  const lastWrittenRef = useRef({});
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  );
  const values = Object.fromEntries(
    Object.entries(params).map(([key, param]) => {
      const encoded = urlParams[key] ?? [];
      const lastWritten = lastWrittenRef.current[key];
      if (lastWritten && arraysEqual2(lastWritten.encoded, encoded)) {
        return [key, lastWritten.decoded];
      } else {
        const decoded = param.decode(encoded);
        delete lastWrittenRef.current[key];
        return [key, decoded];
      }
    })
  );
  const writeToUrl = useCallback(
    (updates) => {
      if (typeof window === "undefined") return;
      const currentParams = strategy.parse();
      for (const [key, encoded] of Object.entries(updates)) {
        if (encoded.length === 0) {
          delete currentParams[key];
        } else {
          currentParams[key] = encoded;
        }
      }
      const url = new URL(window.location.href);
      const newUrl = strategy.buildUrl(url, currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", newUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [push, strategy]
  );
  const debouncedWriteRef = useRef(null);
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(writeToUrl, debounceMs);
    } else {
      debouncedWriteRef.current = null;
    }
    return () => {
      debouncedWriteRef.current?.cancel();
    };
  }, [debounceMs, writeToUrl]);
  const setValues = useCallback(
    (updates) => {
      const encodedUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        const param = params[key];
        if (!param) continue;
        const encoded = param.encode(value);
        encodedUpdates[key] = encoded;
        lastWrittenRef.current[key] = { encoded, decoded: value };
      }
      if (debouncedWriteRef.current) {
        debouncedWriteRef.current(encodedUpdates);
      } else {
        writeToUrl(encodedUpdates);
      }
    },
    [params, writeToUrl]
  );
  return { values, setValues };
}

// src/alphabet.ts
var ALPHABETS = {
  /**
   * RFC 4648 base64url alphabet (default)
   * Standard URL-safe encoding, but NOT lexicographically sortable.
   */
  rfc4648: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  /**
   * ASCII-ordered alphabet for lexicographic sortability
   * Encoded strings sort in the same order as their numeric values.
   * Uses URL-safe characters only (- and _).
   */
  sortable: "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"
};
var URL_SAFE_CHARS = /^[A-Za-z0-9\-_]+$/;
function validateAlphabet(alphabet) {
  if (alphabet.length !== 64) {
    throw new Error(`Alphabet must be exactly 64 characters, got ${alphabet.length}`);
  }
  const seen = /* @__PURE__ */ new Set();
  for (const char of alphabet) {
    if (seen.has(char)) {
      throw new Error(`Duplicate character in alphabet: '${char}'`);
    }
    seen.add(char);
  }
  if (!URL_SAFE_CHARS.test(alphabet)) {
    const unsafe = [...alphabet].filter((c) => !URL_SAFE_CHARS.test(c));
    throw new Error(`Alphabet contains non-URL-safe characters: ${unsafe.map((c) => `'${c}'`).join(", ")}`);
  }
}
function resolveAlphabet(alphabet) {
  if (alphabet in ALPHABETS) {
    return ALPHABETS[alphabet];
  }
  validateAlphabet(alphabet);
  return alphabet;
}
function createLookupMap(alphabet) {
  return new Map(alphabet.split("").map((c, i) => [c, i]));
}

// src/binary.ts
var BASE64_CHARS = ALPHABETS.rfc4648;
var DEFAULT_LOOKUP = createLookupMap(ALPHABETS.rfc4648);
var lookupCache = /* @__PURE__ */ new Map();
function getLookupMap(alphabet) {
  if (alphabet === ALPHABETS.rfc4648) return DEFAULT_LOOKUP;
  let lookup = lookupCache.get(alphabet);
  if (!lookup) {
    lookup = createLookupMap(alphabet);
    lookupCache.set(alphabet, lookup);
  }
  return lookup;
}
function base64Encode(bytes, options) {
  const chars = options?.alphabet ? resolveAlphabet(options.alphabet) : ALPHABETS.rfc4648;
  let result = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const n = b0 << 16 | b1 << 8 | b2;
    result += chars[n >> 18 & 63];
    result += chars[n >> 12 & 63];
    if (i - 2 < bytes.length) {
      result += chars[n >> 6 & 63];
    }
    if (i - 1 < bytes.length) {
      result += chars[n & 63];
    }
  }
  return result;
}
function base64Decode(str, options) {
  const alphabet = options?.alphabet ? resolveAlphabet(options.alphabet) : ALPHABETS.rfc4648;
  const lookup = getLookupMap(alphabet);
  str = str.replace(/=+$/, "");
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup.get(str[i]) ?? 0;
    const c1 = lookup.get(str[i + 1]) ?? 0;
    const c2 = i + 2 < str.length ? lookup.get(str[i + 2]) ?? 0 : 0;
    const c3 = i + 3 < str.length ? lookup.get(str[i + 3]) ?? 0 : 0;
    const n = c0 << 18 | c1 << 12 | c2 << 6 | c3;
    bytes.push(n >> 16 & 255);
    if (i + 2 < str.length) bytes.push(n >> 8 & 255);
    if (i + 3 < str.length) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}
function binaryParam(options) {
  const { toBytes, fromBytes, alphabet } = options;
  const encodeOpts = alphabet ? { alphabet } : void 0;
  return {
    encode: (value) => {
      if (value === null) return void 0;
      const bytes = toBytes(value);
      if (bytes.length === 0) return void 0;
      return base64Encode(bytes, encodeOpts);
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return null;
      try {
        const bytes = base64Decode(encoded, encodeOpts);
        return fromBytes(bytes);
      } catch {
        return null;
      }
    }
  };
}
function base64Param(toBytes, fromBytes, alphabet) {
  return binaryParam({ toBytes, fromBytes, alphabet });
}
function floatToBytes(value) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, value, false);
  return new Uint8Array(buf);
}
function bytesToFloat(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getFloat64(0, false);
}

// src/float.ts
var precisionSchemes = [
  { expBits: 5, mantBits: 16 },
  // ~5 decimal digits
  { expBits: 5, mantBits: 22 },
  // ~7 decimal digits
  { expBits: 5, mantBits: 28 },
  // ~8 decimal digits
  { expBits: 5, mantBits: 34 },
  // ~10 decimal digits
  { expBits: 5, mantBits: 40 },
  // ~12 decimal digits
  { expBits: 5, mantBits: 46 },
  // ~14 decimal digits
  { expBits: 5, mantBits: 52 }
  // ~16 decimal digits (near IEEE 754)
];
var DEFAULT_EXP_BITS = 5;
var MIN_MANT_BITS = 8;
var MAX_MANT_BITS = 52;
function resolvePrecision(precision) {
  if (precision === void 0) return { expBits: DEFAULT_EXP_BITS, mantBits: 22 };
  if (typeof precision === "object") return precision;
  if (precision < MIN_MANT_BITS || precision > MAX_MANT_BITS) {
    throw new Error(`Precision must be ${MIN_MANT_BITS}-${MAX_MANT_BITS} bits, got ${precision}`);
  }
  return { expBits: DEFAULT_EXP_BITS, mantBits: precision };
}
var floatBuf = new ArrayBuffer(8);
var floatView = new DataView(floatBuf);
function toFloat(x) {
  floatView.setFloat64(0, x, false);
  const byte0 = floatView.getUint8(0);
  const neg = !!(byte0 & 128);
  const exp = ((floatView.getUint16(0, false) & 32752) >> 4) - 1023;
  const mant = floatView.getBigUint64(0, false) & 0xfffffffffffffn;
  return { neg, exp, mant };
}
function fromFloat({ neg, exp, mant }) {
  floatView.setBigUint64(
    0,
    (neg ? 0x8000000000000000n : 0n) | BigInt(exp + 1023) << 52n | mant,
    false
  );
  return floatView.getFloat64(0, false);
}
function toFixedPoint(f, opts) {
  let { neg, exp: fExp, mant } = f;
  fExp++;
  const exp = opts.exp === void 0 ? fExp : opts.exp;
  if (fExp > exp) {
    throw Error(`maxExp ${exp} < ${fExp}`);
  }
  const downshiftBy = exp - fExp + 53 - opts.mantBits;
  const roundUp = mant & 1n << BigInt(downshiftBy - 1);
  mant >>= BigInt(downshiftBy);
  if (roundUp) {
    mant += 1n;
  }
  mant |= 1n << BigInt(opts.mantBits - 1 - (exp - fExp));
  return { neg, exp, mant };
}
function fromFixedPoint(f, mantBits) {
  const { neg } = f;
  const nonZeroBits = f.mant ? f.mant.toString(2).length : 0;
  const exp = f.exp - (mantBits - nonZeroBits) - 1;
  if (!f.mant) {
    return { neg, exp: -1023, mant: 0n };
  }
  let mant = BigInt(f.mant);
  mant = mant & (1n << BigInt(nonZeroBits - 1)) - 1n;
  mant <<= BigInt(f.exp - exp);
  mant <<= BigInt(52 - mantBits);
  return { neg, exp, mant };
}
var BitBuffer = class _BitBuffer {
  constructor(numBytes) {
    this.buf = Array(numBytes || 0).fill(0);
    this.byteOffset = 0;
    this.bitOffset = 0;
    this.end = 0;
  }
  get totalBitOffset() {
    return this.byteOffset * 8 + this.bitOffset;
  }
  seek(totalBitOffset) {
    this.byteOffset = totalBitOffset >> 3;
    this.bitOffset = totalBitOffset & 7;
    return this;
  }
  /**
   * Encode an integer with specified bit width
   */
  encodeInt(n, numBits) {
    let { buf, byteOffset, bitOffset } = this;
    while (numBits > 0) {
      if (byteOffset >= buf.length) {
        buf.push(0);
      }
      const remainingBitsInByte = 8 - bitOffset;
      const bitsToWrite = Math.min(numBits, remainingBitsInByte);
      const bitsLeftInByte = remainingBitsInByte - bitsToWrite;
      const bitsLeftToWrite = numBits - bitsToWrite;
      const mask = (1 << bitsToWrite) - 1 << bitsLeftToWrite;
      const shiftedBitsToWrite = (n & mask) >> bitsLeftToWrite;
      buf[byteOffset] |= shiftedBitsToWrite << bitsLeftInByte;
      n &= (1 << bitsLeftToWrite) - 1;
      numBits -= bitsToWrite;
      bitOffset += bitsToWrite;
      if (bitOffset === 8) {
        bitOffset = 0;
        byteOffset++;
      }
    }
    this.byteOffset = byteOffset;
    this.bitOffset = bitOffset;
    if (this.totalBitOffset > this.end) this.end = this.totalBitOffset;
    return this;
  }
  /**
   * Decode an integer with specified bit width
   */
  decodeInt(numBits) {
    let { buf, byteOffset, bitOffset } = this;
    let n = 0;
    while (numBits > 0) {
      const remainingBitsInByte = 8 - bitOffset;
      const bitsToRead = Math.min(numBits, remainingBitsInByte);
      const bitsLeftInByte = remainingBitsInByte - bitsToRead;
      const mask = (1 << bitsToRead) - 1 << bitsLeftInByte;
      const bits = (buf[byteOffset] & mask) >> bitsLeftInByte;
      n = n << bitsToRead | bits;
      numBits -= bitsToRead;
      bitOffset += bitsToRead;
      if (bitOffset === 8) {
        bitOffset = 0;
        byteOffset++;
      }
    }
    this.byteOffset = byteOffset;
    this.bitOffset = bitOffset;
    return n;
  }
  /**
   * Encode a bigint with specified bit width
   */
  encodeBigInt(n, numBits) {
    let { buf, byteOffset, bitOffset } = this;
    while (numBits > 0) {
      if (byteOffset >= buf.length) {
        buf.push(0);
      }
      const remainingBitsInByte = 8 - bitOffset;
      const bitsToWrite = Math.min(numBits, remainingBitsInByte);
      const bitsLeftInByte = remainingBitsInByte - bitsToWrite;
      const bitsLeftToWrite = numBits - bitsToWrite;
      const mask = (1n << BigInt(bitsToWrite)) - 1n << BigInt(bitsLeftToWrite);
      const shiftedBitsToWrite = Number((n & mask) >> BigInt(bitsLeftToWrite));
      buf[byteOffset] |= shiftedBitsToWrite << bitsLeftInByte;
      n &= (1n << BigInt(bitsLeftToWrite)) - 1n;
      numBits -= bitsToWrite;
      bitOffset += bitsToWrite;
      if (bitOffset === 8) {
        bitOffset = 0;
        byteOffset++;
      }
    }
    this.byteOffset = byteOffset;
    this.bitOffset = bitOffset;
    if (this.totalBitOffset > this.end) this.end = this.totalBitOffset;
    return this;
  }
  /**
   * Decode a bigint with specified bit width
   */
  decodeBigInt(numBits) {
    let { buf, byteOffset, bitOffset } = this;
    let n = 0n;
    while (numBits > 0) {
      const remainingBitsInByte = 8 - bitOffset;
      const bitsToRead = Math.min(numBits, remainingBitsInByte);
      const bitsLeftInByte = remainingBitsInByte - bitsToRead;
      const mask = (1 << bitsToRead) - 1 << bitsLeftInByte;
      const bits = BigInt((buf[byteOffset] & mask) >> bitsLeftInByte);
      n = n << BigInt(bitsToRead) | bits;
      numBits -= bitsToRead;
      bitOffset += bitsToRead;
      if (bitOffset === 8) {
        bitOffset = 0;
        byteOffset++;
      }
    }
    this.byteOffset = byteOffset;
    this.bitOffset = bitOffset;
    return n;
  }
  /**
   * Encode an array of floats with shared exponent
   */
  encodeFixedPoints(vals, { expBits, mantBits }) {
    const floats = vals.map(toFloat);
    const maxExp = Math.max(...floats.map(({ exp }) => exp + 1));
    if (maxExp >= 1 << expBits - 1) {
      throw Error(`maxExp ${maxExp} >= ${1 << expBits}`);
    }
    const expToWrite = maxExp + (1 << expBits - 1) & (1 << expBits) - 1;
    this.encodeInt(expToWrite, expBits);
    const fixedPoints = floats.map((f) => toFixedPoint(f, { mantBits, exp: maxExp }));
    fixedPoints.forEach(({ neg, mant }) => {
      this.encodeInt(neg ? 1 : 0, 1);
      this.encodeBigInt(mant, mantBits);
    });
    return this;
  }
  /**
   * Decode an array of floats with shared exponent
   */
  decodeFixedPoints(count, { expBits, mantBits }) {
    const expRaw = this.decodeInt(expBits);
    const exp = expRaw - (1 << expBits - 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      const neg = this.decodeInt(1) === 1;
      const mant = this.decodeBigInt(mantBits);
      const fp = { neg, exp, mant };
      const f = fromFixedPoint(fp, mantBits);
      result.push(fromFloat(f));
    }
    return result;
  }
  /**
   * Get bytes as Uint8Array
   */
  toBytes() {
    const numBytes = Math.ceil(this.end / 8);
    return new Uint8Array(this.buf.slice(0, numBytes));
  }
  /**
   * Create from bytes
   */
  static fromBytes(bytes) {
    const buf = new _BitBuffer();
    buf.buf = Array.from(bytes);
    buf.end = bytes.length * 8;
    return buf;
  }
  /**
   * Convert buffer to URL-safe base64 string
   *
   * Encodes bits directly to base64 (6 bits per character) for maximum compactness.
   * This is more efficient than going through bytes when bit count isn't a multiple of 8.
   *
   * @param options - Base64 options (alphabet)
   */
  toBase64(options) {
    const alphabet = resolveAlphabet(options?.alphabet ?? "rfc4648");
    const overhang = this.end % 6;
    if (overhang) {
      this.encodeInt(0, 6 - overhang);
    }
    const numChars = this.end / 6;
    this.seek(0);
    let result = "";
    for (let i = 0; i < numChars; i++) {
      result += alphabet[this.decodeInt(6)];
    }
    return result;
  }
  /**
   * Create a BitBuffer from a URL-safe base64 string
   *
   * Decodes base64 directly to bits (6 bits per character).
   *
   * @param str - The base64 string to decode
   * @param options - Base64 options (alphabet)
   */
  static fromBase64(str, options) {
    const alphabet = resolveAlphabet(options?.alphabet ?? "rfc4648");
    const lookup = createLookupMap(alphabet);
    const buf = new _BitBuffer();
    for (const char of str) {
      const idx = lookup.get(char);
      if (idx === void 0) {
        throw new Error(`Invalid base64 character: '${char}'`);
      }
      buf.encodeInt(idx, 6);
    }
    buf.seek(0);
    return buf;
  }
};
function parsePrecisionString(s) {
  const match = s.match(/^(\d+)\+(\d+)$/);
  if (!match) {
    throw new Error(`Invalid precision format: "${s}". Expected format like "5+22" (exp+mant)`);
  }
  return { exp: parseInt(match[1], 10), mant: parseInt(match[2], 10) };
}
function floatParam(optsOrDefault = 0) {
  const opts = typeof optsOrDefault === "number" ? { default: optsOrDefault } : optsOrDefault;
  const {
    default: defaultValue = 0,
    encoding = "base64",
    decimals,
    exp,
    mant,
    precision,
    alphabet
  } = opts;
  if (encoding === "string") {
    if (exp !== void 0 || mant !== void 0 || precision !== void 0) {
      throw new Error('exp/mant/precision options are only valid with encoding: "base64"');
    }
  }
  if (encoding === "base64") {
    if (decimals !== void 0) {
      throw new Error('decimals option is only valid with encoding: "string"');
    }
    const hasExpMant = exp !== void 0 || mant !== void 0;
    const hasPrecision = precision !== void 0;
    if (hasExpMant && hasPrecision) {
      throw new Error("Cannot specify both exp/mant and precision");
    }
    if (hasExpMant) {
      if (exp === void 0 || mant === void 0) {
        throw new Error("Both exp and mant must be specified together");
      }
      return createLossyBase64Param(defaultValue, { expBits: exp, mantBits: mant }, alphabet);
    }
    if (hasPrecision) {
      const { exp: e, mant: m } = parsePrecisionString(precision);
      return createLossyBase64Param(defaultValue, { expBits: e, mantBits: m }, alphabet);
    }
    return createLosslessBase64Param(defaultValue, alphabet);
  }
  if (decimals !== void 0) {
    return createTruncatedStringParam(defaultValue, decimals);
  }
  return createFullStringParam(defaultValue);
}
function createLosslessBase64Param(defaultValue, alphabet) {
  const opts = alphabet ? { alphabet } : void 0;
  return {
    encode: (value) => {
      if (value === defaultValue) return void 0;
      return base64Encode(floatToBytes(value), opts);
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return defaultValue;
      try {
        return bytesToFloat(base64Decode(encoded, opts));
      } catch {
        return defaultValue;
      }
    }
  };
}
function createLossyBase64Param(defaultValue, scheme, alphabet) {
  const opts = alphabet ? { alphabet } : void 0;
  return {
    encode: (value) => {
      if (value === defaultValue) return void 0;
      const buf = new BitBuffer();
      buf.encodeFixedPoints([value], scheme);
      return buf.toBase64(opts);
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return defaultValue;
      try {
        const buf = BitBuffer.fromBase64(encoded, opts);
        const [value] = buf.decodeFixedPoints(1, scheme);
        return value;
      } catch {
        return defaultValue;
      }
    }
  };
}
function createFullStringParam(defaultValue) {
  return {
    encode: (value) => {
      if (value === defaultValue) return void 0;
      return value.toString();
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return defaultValue;
      const parsed = parseFloat(encoded);
      return isNaN(parsed) ? defaultValue : parsed;
    }
  };
}
function createTruncatedStringParam(defaultValue, decimals) {
  const multiplier = Math.pow(10, decimals);
  return {
    encode: (value) => {
      if (value === defaultValue) return void 0;
      const truncated = Math.round(value * multiplier) / multiplier;
      return truncated.toFixed(decimals);
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return defaultValue;
      const parsed = parseFloat(encoded);
      return isNaN(parsed) ? defaultValue : parsed;
    }
  };
}
function base64FloatParam(optsOrDefault = 0) {
  const opts = typeof optsOrDefault === "number" ? { default: optsOrDefault } : optsOrDefault;
  return floatParam({ ...opts, encoding: "base64" });
}
function pointParam(opts = {}) {
  const {
    encoding = "base64",
    decimals = 2,
    precision,
    default: defaultPoint = null,
    alphabet
  } = opts;
  const scheme = resolvePrecision(precision);
  const multiplier = Math.pow(10, decimals);
  const base64Opts = alphabet ? { alphabet } : void 0;
  return {
    encode: (point) => {
      if (point === null) return void 0;
      if (defaultPoint && point.x === defaultPoint.x && point.y === defaultPoint.y) {
        return void 0;
      }
      if (encoding === "string") {
        const xTrunc = Math.round(point.x * multiplier) / multiplier;
        const yTrunc = Math.round(point.y * multiplier) / multiplier;
        const xStr = xTrunc.toFixed(decimals);
        const yStr = yTrunc.toFixed(decimals);
        const delimiter = yTrunc >= 0 ? " " : "";
        return `${xStr}${delimiter}${yStr}`;
      } else {
        const buf = new BitBuffer();
        buf.encodeFixedPoints([point.x, point.y], scheme);
        return buf.toBase64(base64Opts);
      }
    },
    decode: (encoded) => {
      if (encoded === void 0 || encoded === "") return defaultPoint;
      try {
        if (encoding === "string") {
          let x, y;
          if (encoded.includes(" ")) {
            const parts = encoded.split(" ");
            if (parts.length !== 2) return defaultPoint;
            x = parseFloat(parts[0]);
            y = parseFloat(parts[1]);
          } else {
            const minusIdx = encoded.indexOf("-", encoded[0] === "-" ? 1 : 0);
            if (minusIdx === -1) return defaultPoint;
            x = parseFloat(encoded.slice(0, minusIdx));
            y = parseFloat(encoded.slice(minusIdx));
          }
          if (isNaN(x) || isNaN(y)) return defaultPoint;
          return { x, y };
        } else {
          const buf = BitBuffer.fromBase64(encoded, base64Opts);
          const [x, y] = buf.decodeFixedPoints(2, scheme);
          return { x, y };
        }
      } catch {
        return defaultPoint;
      }
    }
  };
}
function encodeFloatAllModes(value, opts = {}) {
  const { decimals = 2, precision } = opts;
  const scheme = resolvePrecision(precision);
  const multiplier = Math.pow(10, decimals);
  const truncated = Math.round(value * multiplier) / multiplier;
  const stringEncoded = truncated.toFixed(decimals);
  const buf = new BitBuffer();
  buf.encodeFixedPoints([value], scheme);
  return {
    string: stringEncoded,
    base64: buf.toBase64(),
    bits: buf.end
  };
}
function encodePointAllModes(point, opts = {}) {
  const { decimals = 2, precision } = opts;
  const scheme = resolvePrecision(precision);
  const multiplier = Math.pow(10, decimals);
  const xTrunc = Math.round(point.x * multiplier) / multiplier;
  const yTrunc = Math.round(point.y * multiplier) / multiplier;
  const xStr = xTrunc.toFixed(decimals);
  const yStr = yTrunc.toFixed(decimals);
  const delimiter = yTrunc >= 0 ? "+" : "";
  const stringEncoded = `${xStr}${delimiter}${yStr}`;
  const buf = new BitBuffer();
  buf.encodeFixedPoints([point.x, point.y], scheme);
  return {
    string: stringEncoded,
    base64: buf.toBase64(),
    bits: buf.end
  };
}

// src/index.ts
function serializeParams(params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0) {
      continue;
    } else if (value === "") {
      continue;
    } else {
      searchParams.set(key, value);
    }
  }
  let result = searchParams.toString();
  const valuelessKeys = Object.entries(params).filter(([_, value]) => value === "").map(([key, _]) => encodeURIComponent(key));
  if (valuelessKeys.length > 0) {
    const valuelessPart = valuelessKeys.join("&");
    result = result ? `${result}&${valuelessPart}` : valuelessPart;
  }
  return result;
}
function parseParams(source) {
  const searchParams = typeof source === "string" ? new URLSearchParams(source) : source;
  const result = {};
  for (const [key, value] of searchParams.entries()) {
    if (!(key in result)) {
      result[key] = value;
    }
  }
  return result;
}
function getCurrentParams() {
  if (typeof window === "undefined") return {};
  return parseParams(window.location.search);
}
function updateUrl(params, push = false) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const search = serializeParams(params);
  url.search = search;
  const method = push ? "pushState" : "replaceState";
  window.history[method]({}, "", url.toString());
}

// src/hash.ts
setDefaultStrategy(hashStrategy);

export { ALPHABETS, BASE64_CHARS, BitBuffer, precisionSchemes as PRECISION_SCHEMES, base64Decode, base64Encode, base64FloatParam, base64Param, binaryParam, boolParam, bytesToFloat, clearParams, codeParam, codesParam, createLookupMap, defStringParam, encodeFloatAllModes, encodePointAllModes, enumParam, floatParam, floatToBytes, fromFixedPoint, fromFloat, getCurrentParams, getDefaultStrategy, hashStrategy, intParam, multiFloatParam, multiIntParam, multiStringParam, notifyLocationChange, numberArrayParam, optIntParam, paginationParam, parseMultiParams, parseParams, pointParam, precisionSchemes, queryStrategy, resolveAlphabet, resolvePrecision, serializeMultiParams, serializeParams, setDefaultStrategy, stringParam, stringsParam, toFixedPoint, toFloat, updateUrl, useMultiUrlState, useMultiUrlStates, useUrlState, useUrlStates, validateAlphabet };
//# sourceMappingURL=hash.js.map
//# sourceMappingURL=hash.js.map