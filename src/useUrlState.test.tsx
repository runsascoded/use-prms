/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { useUrlState } from './useUrlState.js'
import { intParam } from './index.js'

// Reset URL before each test
beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUrlState debounce', () => {
  it('value does not revert on unrelated re-render during debounce window', () => {
    vi.useFakeTimers()

    // Custom hook that combines debounced useUrlState with unrelated useState
    function useTestHook() {
      const [value, setValue] = useUrlState('d', intParam(0), { debounce: 500 })
      const [counter, setCounter] = useState(0)
      return { value, setValue, counter, setCounter }
    }

    const { result } = renderHook(() => useTestHook())

    // Initial state: value = 0, URL = /
    expect(result.current.value).toBe(0)
    expect(window.location.search).toBe('')

    // Call setValue(42) — sets lastWrittenRef, schedules debounced URL write
    act(() => {
      result.current.setValue(42)
    })

    // Value should reflect 42 immediately (not wait for debounce)
    // BUG: without fix, this is still 0 because value comes from URL (unchanged)
    expect(result.current.value).toBe(42)

    // URL should NOT have updated yet (debounce hasn't fired)
    expect(window.location.search).toBe('')

    // Trigger unrelated re-render
    act(() => {
      result.current.setCounter(1)
    })

    // Value should still be 42 after unrelated re-render
    // BUG: without fix, this snaps back to 0 because:
    // - lastWrittenRef.encoded ('42') !== encoded (undefined, from URL)
    // - Falls through to param.decode(undefined) = 0
    // - lastWrittenRef cleared!
    expect(result.current.value).toBe(42)

    // Advance time past debounce
    act(() => {
      vi.advanceTimersByTime(600)
    })

    // Now URL should be updated
    expect(window.location.search).toBe('?d=42')
    // And value should still be 42
    expect(result.current.value).toBe(42)
  })

  it('rapid setValue calls preserve final value', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() =>
      useUrlState('d', intParam(0), { debounce: 500 })
    )

    expect(result.current[0]).toBe(0)

    // Rapid-fire value changes
    for (const v of [10, 20, 30, 40, 50]) {
      act(() => {
        result.current[1](v)
      })
    }

    // Should show final value immediately
    expect(result.current[0]).toBe(50)

    // URL should not have updated yet
    expect(window.location.search).toBe('')

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(600)
    })

    // URL should show final value
    expect(window.location.search).toBe('?d=50')
    expect(result.current[0]).toBe(50)
  })

  it('external navigation during debounce discards pending value', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() =>
      useUrlState('d', intParam(0), { debounce: 500 })
    )

    // Set debounced value
    act(() => {
      result.current[1](99)
    })
    expect(result.current[0]).toBe(99)

    // External navigation (simulate back button or other code changing URL)
    act(() => {
      window.history.replaceState({}, '', '/?n=hello')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    // External change should win — value should reset to default (0)
    // since 'd' is not in the new URL
    expect(result.current[0]).toBe(0)

    // Advance past debounce — the pending write should have been discarded
    act(() => {
      vi.advanceTimersByTime(600)
    })

    // URL should NOT contain d=99
    expect(window.location.search).not.toContain('d=99')
  })

  it('non-debounced setValue works unchanged (regression)', () => {
    const { result } = renderHook(() =>
      useUrlState('d', intParam(0))
    )

    expect(result.current[0]).toBe(0)

    act(() => {
      result.current[1](42)
    })

    // Without debounce, URL updates immediately
    expect(window.location.search).toBe('?d=42')
    expect(result.current[0]).toBe(42)
  })
})
