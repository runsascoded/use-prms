'use strict';

var react = require('react');

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
    decode: (encoded) => encoded !== void 0 ? parseInt(encoded, 10) : init
  };
}
var optIntParam = {
  encode: (value) => value === null ? void 0 : value.toString(),
  decode: (encoded) => encoded !== void 0 ? parseInt(encoded, 10) : null
};
function floatParam(init) {
  return {
    encode: (value) => value === init ? void 0 : value.toString(),
    decode: (encoded) => encoded !== void 0 ? parseFloat(encoded) : init
  };
}
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
var cachedSnapshot = null;
var cachedSearch = null;
function subscribeToUrl(callback) {
  if (typeof window === "undefined") return () => {
  };
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function getUrlSnapshot() {
  if (typeof window === "undefined") return {};
  const search = window.location.search;
  if (cachedSearch === search && cachedSnapshot !== null) {
    return cachedSnapshot;
  }
  cachedSearch = search;
  cachedSnapshot = getCurrentParams();
  return cachedSnapshot;
}
function getServerSnapshot() {
  return {};
}
function useUrlParam(key, param, push = false) {
  const paramRef = react.useRef(param);
  paramRef.current = param;
  const urlParams = react.useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getServerSnapshot
  );
  const value = param.decode(urlParams[key]);
  const setValue = react.useCallback(
    (newValue) => {
      if (typeof window === "undefined") return;
      const currentParams = getCurrentParams();
      const encoded = paramRef.current.encode(newValue);
      if (encoded === void 0) {
        delete currentParams[key];
      } else {
        currentParams[key] = encoded;
      }
      const url = new URL(window.location.href);
      url.search = serializeParams(currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [key, push]
  );
  return [value, setValue];
}
function useUrlParams(params, push = false) {
  const urlParams = react.useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getServerSnapshot
  );
  const values = Object.fromEntries(
    Object.entries(params).map(([key, param]) => [
      key,
      param.decode(urlParams[key])
    ])
  );
  const setValues = react.useCallback(
    (updates) => {
      if (typeof window === "undefined") return;
      const currentParams = getCurrentParams();
      for (const [key, value] of Object.entries(updates)) {
        const param = params[key];
        if (!param) continue;
        const encoded = param.encode(value);
        if (encoded === void 0) {
          delete currentParams[key];
        } else {
          currentParams[key] = encoded;
        }
      }
      const url = new URL(window.location.href);
      url.search = serializeParams(currentParams);
      const method = push ? "pushState" : "replaceState";
      window.history[method]({}, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [params, push]
  );
  return { values, setValues };
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
function parseParams2(source) {
  const searchParams = typeof source === "string" ? new URLSearchParams(source) : source;
  const result = {};
  for (const [key, value] of searchParams.entries()) {
    result[key] = value;
  }
  return result;
}
function getCurrentParams() {
  if (typeof window === "undefined") return {};
  return parseParams2(window.location.search);
}
function updateUrl(params, push = false) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const search = serializeParams(params);
  url.search = search;
  const method = push ? "pushState" : "replaceState";
  window.history[method]({}, "", url.toString());
}

exports.boolParam = boolParam;
exports.defStringParam = defStringParam;
exports.enumParam = enumParam;
exports.floatParam = floatParam;
exports.getCurrentParams = getCurrentParams;
exports.intParam = intParam;
exports.numberArrayParam = numberArrayParam;
exports.optIntParam = optIntParam;
exports.parseParams = parseParams2;
exports.serializeParams = serializeParams;
exports.stringParam = stringParam;
exports.stringsParam = stringsParam;
exports.updateUrl = updateUrl;
exports.useUrlParam = useUrlParam;
exports.useUrlParams = useUrlParams;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map