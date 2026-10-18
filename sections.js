import { useSyncExternalStore, useReducer, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { jsx } from 'react/jsx-runtime';

// src/sections/spy.tsx

// src/strategies.ts
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
var unpatchedPushState = null;
var unpatchedReplaceState = null;
function patchHistoryApi() {
  if (typeof window === "undefined" || historyPatched) return;
  historyPatched = true;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  unpatchedPushState = originalPushState;
  unpatchedReplaceState = originalReplaceState;
  history.pushState = function(state, title, url) {
    originalPushState(state, title, url);
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
  };
  history.replaceState = function(state, title, url) {
    originalReplaceState(state, title, url);
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
  };
}
function silentReplaceState(data, unused, url) {
  if (unpatchedReplaceState) unpatchedReplaceState(data, unused, url);
  else if (typeof window !== "undefined") window.history.replaceState(data, unused, url);
}
function silentPushState(data, unused, url) {
  if (unpatchedPushState) unpatchedPushState(data, unused, url);
  else if (typeof window !== "undefined") window.history.pushState(data, unused, url);
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
  };
var defaultStrategy = queryStrategy;
function getDefaultStrategy() {
  return defaultStrategy;
}

// src/sections/nav.ts
function navScroll(prev, next, navType, live, saved) {
  const target = next.section ? { kind: "section", id: next.section } : { kind: "none" };
  if (!prev) return saved !== void 0 ? { kind: "restore", y: saved } : target;
  const pathChanged = next.pathname !== prev.pathname;
  if (navType === "POP" && next.key !== prev.key) {
    if (saved !== void 0) return { kind: "restore", y: saved };
    return next.section ? target : pathChanged ? { kind: "top" } : { kind: "none" };
  }
  if (pathChanged) {
    if (next.section && next.section === prev.section) return { kind: "top" };
    return next.section ? target : { kind: "top" };
  }
  return next.section !== live && next.section !== prev.section ? target : { kind: "none" };
}
var defaultReference = {
  offset: () => 0,
  nearFrac: 1 / 3,
  nearPx: 150,
  slidePx: 280,
  topPx: 40
};
var clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
function sectionInView(ids, ref) {
  const off = ref.offset();
  const h = window.innerHeight;
  const maxY = document.documentElement.scrollHeight - h;
  const near = off + Math.min(h * ref.nearFrac, ref.nearPx);
  const descend = Math.min(h - near, maxY, ref.slidePx);
  const progress = maxY > 0 ? clamp01((window.scrollY - (maxY - descend)) / descend) : 0;
  const yRef = near + (h - near) * progress;
  let cur = "";
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= yRef) cur = id;
  }
  return window.scrollY < ref.topPx ? "" : cur;
}

// src/sections/userScroll.ts
var lastInput = -Infinity;
var lastUserScroll = -Infinity;
var USER_SCROLL_MS = 1e3;
var MOMENTUM_MS = 200;
var SCROLL_KEYS = /* @__PURE__ */ new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
var INPUT_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"];
function isUserScroll(now) {
  return now - lastInput < USER_SCROLL_MS || now - lastUserScroll < MOMENTUM_MS;
}
function resetUserScroll() {
  lastInput = -Infinity;
  lastUserScroll = -Infinity;
}
function lastInputAt() {
  return lastInput;
}
function markUserScroll(now) {
  lastUserScroll = now;
}
function editable(t) {
  const el = t;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ""));
}
function onInput(e) {
  if (e.type === "keydown") {
    const k = e;
    if (!SCROLL_KEYS.has(k.key) || editable(k.target)) return;
  } else if (e.type === "pointerdown") {
    const p = e;
    if (p.target !== document.documentElement && p.clientX < document.documentElement.clientWidth) return;
  }
  lastInput = performance.now();
}
var NUDGE_MS = 250;
var WRITE_THROTTLE_MS = 100;
var DEFAULT_POS = { storage: "session", key: "use-prms:sections:pos", max: 200 };
var liveSection = "";
var sectionListeners = /* @__PURE__ */ new Set();
function publishSection(s) {
  if (s === liveSection) return;
  liveSection = s;
  for (const cb of sectionListeners) cb();
}
function useSectionInView() {
  return useSyncExternalStore(
    (cb) => {
      sectionListeners.add(cb);
      return () => {
        sectionListeners.delete(cb);
      };
    },
    () => liveSection,
    () => ""
  );
}
var currentMode = { kind: "fragment" };
var currentJumpWrite = "replace";
var currentAliases = {};
var stripLead = (s) => s.replace(/^[?#]/, "");
function decodeSection(mode, loc) {
  if (mode.kind === "fragment") {
    const id2 = loc.hash ? stripLead(loc.hash) : "";
    return currentAliases[id2] ?? id2;
  }
  const raw = (mode.location ?? "query") === "hash" ? loc.hash : loc.search;
  const v = parseMultiParams(stripLead(raw))[mode.key ?? "s"]?.[0];
  if (!v) return "";
  const id = mode.decode ? mode.decode(v) : v;
  return currentAliases[id] ?? id;
}
function applySection(url, mode, id) {
  if (mode.kind === "fragment") {
    url.hash = id ? `#${id}` : "";
    return;
  }
  const key = mode.key ?? "s";
  const value = id ? mode.encode ? mode.encode(id) : id : "";
  const inHash = (mode.location ?? "query") === "hash";
  const params = parseMultiParams(stripLead(inHash ? url.hash : url.search));
  if (value) params[key] = [value];
  else delete params[key];
  const serialized = serializeMultiParams(params);
  if (inHash) url.hash = serialized ? `#${serialized}` : "";
  else url.search = serialized ? `?${serialized}` : "";
}
function sectionUrl(mode, id, pathname) {
  const url = new URL(window.location.href);
  if (pathname !== void 0) url.pathname = pathname;
  applySection(url, mode, id);
  return url.pathname + url.search + url.hash;
}
function adoptedUrl(mode, id) {
  const url = new URL(window.location.href);
  url.hash = "";
  applySection(url, mode, id);
  return url.pathname + url.search + url.hash;
}
function writeSection(mode, id, op) {
  publishSection(id);
  const url = sectionUrl(mode, id);
  (op === "push" ? silentPushState : silentReplaceState)(history.state, "", url);
}
var parkedAt = (el) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
function focusSection(el) {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  try {
    el.focus({ preventScroll: true });
  } catch {
  }
  el.setAttribute("data-section-target", "");
}
function jumpToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  resetUserScroll();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  focusSection(el);
  writeSection(currentMode, id, currentJumpWrite);
}
function sectionHref(id, opts) {
  return sectionUrl(currentMode, id, opts?.pathname);
}
function withoutSection(search) {
  if (currentMode.kind !== "param" || (currentMode.location ?? "query") === "hash") return search;
  const params = parseMultiParams(stripLead(search));
  delete params[currentMode.key ?? "s"];
  const s = serializeMultiParams(params);
  return s ? `?${s}` : "";
}
function SectionLink({ id, className, children }) {
  return /* @__PURE__ */ jsx(
    "a",
    {
      className,
      href: sectionHref(id),
      onClick: (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        jumpToSection(id);
      },
      children
    }
  );
}
function store(cfg) {
  if (!cfg || typeof window === "undefined") return null;
  try {
    return cfg.storage === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
function loadPositions(cfg) {
  const s = store(cfg);
  if (!s || !cfg) return {};
  try {
    return JSON.parse(s.getItem(cfg.key) ?? "{}");
  } catch {
    return {};
  }
}
function savePosition(cfg, key, y) {
  const s = store(cfg);
  if (!s || !cfg) return;
  try {
    const all = loadPositions(cfg);
    all[key] = Math.round(y);
    const keys = Object.keys(all);
    if (keys.length > cfg.max) for (const k of keys.slice(0, keys.length - cfg.max)) delete all[k];
    s.setItem(cfg.key, JSON.stringify(all));
  } catch {
  }
}
function savedPosition(cfg, key) {
  return loadPositions(cfg)[key];
}
function entryKey(routerKey) {
  if (routerKey !== "default") return routerKey;
  const st = history.state ?? {};
  if (st.upKey) return st.upKey;
  const upKey = `up-${Math.random().toString(36).slice(2, 10)}`;
  silentReplaceState({ ...st, upKey }, "", window.location.href);
  return upKey;
}
function resolveMode(mode) {
  const hashEntry = getDefaultStrategy() === hashStrategy;
  if (!mode) {
    if (hashEntry) return { mode: null, warn: 'useSectionSpy: no default mode under use-prms/hash (the fragment holds params). Pass mode: { kind: "param" }. Spy inert.' };
    return { mode: { kind: "fragment" } };
  }
  if (mode.kind === "fragment" && hashEntry) {
    return { mode: null, warn: "useSectionSpy: fragment mode refused under use-prms/hash (the fragment holds params). Spy inert." };
  }
  return { mode };
}
function resolveIds(sections) {
  if (!sections) sections = { selector: "[data-section]" };
  if (Array.isArray(sections)) return [...sections];
  const sel = sections.selector;
  return [...document.querySelectorAll(sel)].map((el) => el.getAttribute("data-section") || el.id).filter(Boolean);
}
function useWindowNav() {
  const [, force] = useReducer((c) => c + 1, 0);
  const navTypeRef = useRef("POP");
  useEffect(() => {
    const onPop = () => {
      navTypeRef.current = "POP";
      force();
    };
    const onChange = () => {
      navTypeRef.current = "REPLACE";
      force();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("use-prms:locationchange", onChange);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("use-prms:locationchange", onChange);
    };
  }, []);
  const { pathname, search, hash } = typeof window !== "undefined" ? window.location : { pathname: "/", search: "", hash: "" };
  const location = useMemo(
    () => ({ pathname, search, hash, key: "default" }),
    [pathname, search, hash]
  );
  return { location, navType: navTypeRef.current };
}
var mountedSpies = 0;
function useSectionSpy(opts = {}) {
  const windowNav = useWindowNav();
  const nav = opts.nav ?? windowNav;
  const { location, navType } = nav;
  const resolved = useMemo(() => resolveMode(opts.mode), [opts.mode]);
  const mode = resolved.mode;
  const write = opts.write ?? "replace";
  const jumpWrite = opts.jumpWrite ?? "replace";
  const aliases = opts.aliases ?? {};
  const pursuitMs = opts.pursuitMs ?? 2e4;
  const posCfg = opts.positions === false ? null : { ...DEFAULT_POS, ...opts.positions };
  const reference = { ...defaultReference, ...opts.reference };
  const deps = opts.deps ?? [];
  currentMode = mode ?? { kind: "fragment" };
  currentJumpWrite = jumpWrite;
  currentAliases = aliases;
  const prev = useRef(null);
  const keyRef = useRef("");
  const target = useRef({ kind: "none" });
  const stopPursuit = useRef(() => {
  });
  useEffect(() => {
    if (resolved.warn) console.warn(resolved.warn);
  }, [resolved.warn]);
  useEffect(() => {
    mountedSpies += 1;
    if (mountedSpies > 1) {
      console.warn("useSectionSpy: more than one spy mounted; only one per page is supported.");
    }
    return () => {
      mountedSpies -= 1;
    };
  }, []);
  const idsFor = () => resolveIds(opts.sections);
  const pursue = () => {
    stopPursuit.current();
    const t = target.current;
    if (t.kind !== "section" && t.kind !== "restore") return;
    const id = t.kind === "section" ? aliases[t.id] ?? t.id : "";
    let last = NaN;
    let lastH = NaN;
    let tries = 0;
    const step = () => {
      const h = document.documentElement.scrollHeight;
      if (t.kind === "restore") {
        if (Math.abs(window.scrollY - t.y) < 2 && h === lastH) return true;
        lastH = h;
        window.scrollTo({ top: t.y, behavior: "instant" });
        return false;
      }
      const el = document.getElementById(id);
      if (!el) return false;
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - parkedAt(el)) < 4 && top === last && h === lastH) {
        focusSection(el);
        return true;
      }
      last = top;
      lastH = h;
      el.scrollIntoView({ behavior: "instant", block: "start" });
      return false;
    };
    const stop = () => {
      clearInterval(iv);
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, cancel);
      stopPursuit.current = () => {
      };
    };
    const cancel = (e) => {
      onInput(e);
      if (performance.now() - lastInputAt() > 50) return;
      target.current = { kind: "none" };
      stop();
    };
    const iv = setInterval(() => {
      if (++tries > pursuitMs / NUDGE_MS || step()) stop();
    }, NUDGE_MS);
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, cancel, { passive: true });
    stopPursuit.current = stop;
    step();
  };
  useLayoutEffect(() => {
    if (!mode) return;
    const from = prev.current;
    let next = { pathname: location.pathname, section: decodeSection(mode, location), key: location.key };
    if (!from && mode.kind === "param" && (mode.adoptFragment ?? true) && location.hash) {
      const frag = stripLead(location.hash);
      const canonical = aliases[frag] ?? frag;
      const hashEntry = getDefaultStrategy() === hashStrategy;
      const looksLikeParams = /[=&]/.test(frag);
      if (!looksLikeParams && !hashEntry && idsFor().includes(canonical)) {
        next = { ...next, section: canonical };
        publishSection(canonical);
        silentReplaceState(history.state, "", adoptedUrl(mode, canonical));
      }
    }
    const curLive = from ? liveSection : next.section;
    const k = entryKey(location.key);
    const act = navScroll(from, next, navType, curLive, savedPosition(posCfg, k));
    prev.current = next;
    keyRef.current = k;
    liveSection = next.section;
    publishSection(next.section);
    if (act.kind === "none") {
      if (next.section !== liveSection) silentReplaceState(history.state, "", sectionUrl(mode, liveSection));
      return;
    }
    resetUserScroll();
    target.current = act;
    if (act.kind === "top") {
      stopPursuit.current();
      window.scrollTo({ top: 0, behavior: "instant" });
      publishSection("");
      liveSection = "";
      if (next.section) silentReplaceState(history.state, "", sectionUrl(mode, ""));
      savePosition(posCfg, k, 0);
      return;
    }
    pursue();
  }, [location.key, location.pathname, location.search, location.hash]);
  useEffect(() => {
    if (target.current.kind === "section" || target.current.kind === "restore") pursue();
  }, deps);
  useEffect(() => () => stopPursuit.current(), []);
  useEffect(() => {
    if (!mode) return;
    const prevRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let raf = 0;
    let lastWrite = 0;
    let lastH = document.documentElement.scrollHeight;
    const onScroll = () => {
      const now = performance.now();
      if (!isUserScroll(now)) return;
      markUserScroll(now);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement.scrollHeight;
        if (h < lastH) {
          lastH = h;
          return;
        }
        lastH = h;
        savePosition(posCfg, keyRef.current, window.scrollY);
        if (write === "off") return;
        const id = sectionInView(idsFor(), reference);
        if (id === liveSection) return;
        if (performance.now() - lastWrite < WRITE_THROTTLE_MS) return;
        lastWrite = performance.now();
        writeSection(mode, id, "replace");
      });
    };
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, onInput, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, onInput, { capture: true });
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      history.scrollRestoration = prevRestoration;
      resetUserScroll();
    };
  }, [mode, write]);
}

export { SectionLink, isUserScroll, jumpToSection, navScroll, resetUserScroll, sectionHref, sectionInView, useSectionInView, useSectionSpy, useWindowNav, withoutSection };
//# sourceMappingURL=sections.js.map
//# sourceMappingURL=sections.js.map