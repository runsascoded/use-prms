/**
 * @vitest-environment happy-dom
 *
 * Vue binding tests. The composables are driven inside an `effectScope` (no
 * component mount / SFC compiler needed) — enough to exercise the writable
 * refs, reactivity wiring, debounce, and batched writes. Real component
 * mounting is covered by the Playwright e2e against the Vue demo page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { effectScope, nextTick, watch, type Ref } from 'vue'
import { intParam, stringParam } from './params.js'
import { useUrlState, useUrlStates } from './vue.js'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

/** Run `fn` in a fresh effect scope; returns its result + a stop() disposer. */
function inScope<T>(fn: () => T): { value: T; stop: () => void } {
  const scope = effectScope()
  const value = scope.run(fn)!
  return { value, stop: () => scope.stop() }
}

describe('useUrlState (Vue)', () => {
  it('reads the initial value from the URL and writes back through the ref', () => {
    window.history.replaceState({}, '', '/?d=3')
    const { value: n, stop } = inScope(() => useUrlState('d', intParam(0)))
    expect(n.value).toBe(3)

    n.value = 7
    expect(window.location.search).toBe('?d=7')
    expect(n.value).toBe(7)

    // The default is dropped from the URL.
    n.value = 0
    expect(window.location.search).toBe('')
    stop()
  })

  it('reacts to an external URL change (watcher fires, value updates)', async () => {
    let n!: Ref<number>
    const seen: number[] = []
    const scope = effectScope()
    scope.run(() => {
      n = useUrlState('d', intParam(0))
      watch(n, (v) => seen.push(v))
    })
    expect(n.value).toBe(0)

    window.history.replaceState({}, '', '/?d=9')
    await nextTick()

    expect(n.value).toBe(9)
    expect(seen).toEqual([9])
    scope.stop()
  })

  it('debounces the URL write but updates the ref immediately', () => {
    vi.useFakeTimers()
    const { value: n, stop } = inScope(() => useUrlState('d', intParam(0), { debounce: 100 }))

    n.value = 4
    expect(n.value).toBe(4)
    expect(window.location.search).toBe('')

    vi.advanceTimersByTime(100)
    expect(window.location.search).toBe('?d=4')

    stop()
    vi.useRealTimers()
  })

  it('stops subscribing after the scope is disposed', () => {
    const { value: n, stop } = inScope(() => useUrlState('d', intParam(0)))
    n.value = 1
    expect(window.location.search).toBe('?d=1')
    stop()
    // A later external change must not throw; the (now-orphaned) ref still
    // reads the live URL on access, it just no longer schedules effects.
    expect(() => window.history.replaceState({}, '', '/?d=2')).not.toThrow()
    expect(n.value).toBe(2)
  })
})

describe('useUrlStates (Vue)', () => {
  it('exposes a reactive two-way object and batches setValues into one write', () => {
    const { value: api, stop } = inScope(() =>
      useUrlStates({ a: intParam(0), b: stringParam('') }))

    expect(api.values.a).toBe(0)
    expect(api.values.b).toBe('')

    // Batched: both keys land in a single write.
    api.setValues({ a: 1, b: 'x' })
    expect(window.location.search).toBe('?a=1&b=x')
    expect(api.values.a).toBe(1)
    expect(api.values.b).toBe('x')

    // Two-way through the reactive object.
    api.values.a = 5
    expect(window.location.search).toBe('?a=5&b=x')
    stop()
  })

  it('produces the same query string a single-key write would (parity)', () => {
    // Same codecs → same encoding whether written one key at a time or batched.
    const { value: api, stop } = inScope(() =>
      useUrlStates({ d: intParam(0), n: stringParam('') }))
    api.values.d = 7
    api.values.n = 'hi'
    expect(window.location.search).toBe('?d=7&n=hi')
    stop()
  })
})
