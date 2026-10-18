/**
 * Reader-input tracking: distinguishing the reader's own scrolling from a
 * programmatic scroll, a restore, or the browser clamping `scrollY` when the
 * page shrinks. Module-level state, set by the hook's capture-phase input
 * listeners and read by {@link isUserScroll}. Ported verbatim from disky's
 * `hashSpy`.
 */

// Last reader input that scrolls the page; a scroll event within
// USER_SCROLL_MS of it (or chained to a recent reader scroll — touch momentum
// outlives the gesture) is the reader's, anything else is ours or the layout's.
let lastInput = -Infinity
let lastUserScroll = -Infinity

const USER_SCROLL_MS = 1000
const MOMENTUM_MS = 200
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export const INPUT_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

/** Whether the scroll happening now is the reader's own. */
export function isUserScroll(now: number): boolean {
  return now - lastInput < USER_SCROLL_MS || now - lastUserScroll < MOMENTUM_MS
}

/** Forget any pending reader input: a navigation's own scroll must not read as theirs. */
export function resetUserScroll(): void {
  lastInput = -Infinity
  lastUserScroll = -Infinity
}

/** The last reader input / scroll timestamps, for the hook's pursuit-cancel check. */
export function lastInputAt(): number {
  return lastInput
}
export function markUserScroll(now: number): void {
  lastUserScroll = now
}

function editable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''))
}

/** Capture-phase handler for {@link INPUT_EVENTS}: stamps `lastInput` when the event is reader scroll intent. */
export function onInput(e: Event): void {
  if (e.type === 'keydown') {
    const k = e as KeyboardEvent
    if (!SCROLL_KEYS.has(k.key) || editable(k.target)) return
  } else if (e.type === 'pointerdown') {
    // Only a press on the page's own scrollbar (the root element, or past the content width).
    const p = e as PointerEvent
    if (p.target !== document.documentElement && p.clientX < document.documentElement.clientWidth) return
  }
  lastInput = performance.now()
}
