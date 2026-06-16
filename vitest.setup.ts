import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react@16's afterEach cleanup hook isn't auto-registered in
// vitest 4 + React 19 environments. Without this, mounted components from
// prior tests stay subscribed and re-render when `window.history` changes in
// the next test's `beforeEach`, leaking effects (e.g. extra `console.warn`s
// from `useUrlAlias` conflict paths) into adjacent assertions.
afterEach(() => {
  cleanup()
})
