import { describe, it, expect } from 'vitest'
import { flagPackParam } from './flagPack.js'

const elvisSpec = { Z: true, H: true, A: true, C: true, L: true, E: true } as const

describe('flagPackParam — encode', () => {
  it('returns undefined when all flags at default', () => {
    const p = flagPackParam(elvisSpec)
    expect(p.encode({ Z: true, H: true, A: true, C: true, L: true, E: true })).toBeUndefined()
  })

  it('emits only flipped flags', () => {
    const p = flagPackParam(elvisSpec)
    expect(p.encode({ Z: false, H: true, A: true, C: true, L: true, E: true })).toBe('Z')
    expect(p.encode({ Z: false, H: false, A: true, C: true, L: true, E: true })).toBe('ZH')
  })

  it('emits letters in declaration order, regardless of object iteration order', () => {
    const p = flagPackParam(elvisSpec)
    // Mixed-order input still produces declaration-order output
    expect(p.encode({ E: false, A: false, Z: false, H: true, C: true, L: true })).toBe('ZAE')
  })

  it('handles mixed defaults (default-on flipped off + default-off flipped on)', () => {
    const p = flagPackParam({ Z: true, G: false } as const)
    expect(p.encode({ Z: false, G: true })).toBe('ZG')
    expect(p.encode({ Z: true, G: false })).toBeUndefined()
  })
})

describe('flagPackParam — decode', () => {
  const p = flagPackParam(elvisSpec)

  it('all-default on undefined and empty input', () => {
    const allDefault = { Z: true, H: true, A: true, C: true, L: true, E: true }
    expect(p.decode(undefined)).toEqual(allDefault)
    expect(p.decode('')).toEqual(allDefault)
  })

  it('flips listed flags', () => {
    expect(p.decode('Z')).toEqual({ Z: false, H: true, A: true, C: true, L: true, E: true })
    expect(p.decode('ZH')).toEqual({ Z: false, H: false, A: true, C: true, L: true, E: true })
    expect(p.decode('ZHACLE')).toEqual({ Z: false, H: false, A: false, C: false, L: false, E: false })
  })

  it('order-insensitive: ?_=HZ same state as ?_=ZH', () => {
    expect(p.decode('HZ')).toEqual(p.decode('ZH'))
  })

  it('duplicates are idempotent', () => {
    expect(p.decode('ZZ')).toEqual(p.decode('Z'))
    expect(p.decode('ZHZH')).toEqual(p.decode('ZH'))
  })

  it('unknown letters silently ignored, known letters still applied', () => {
    expect(p.decode('ZxQ')).toEqual({ Z: false, H: true, A: true, C: true, L: true, E: true })
  })

  it('mixed defaults round-trip', () => {
    const mixed = flagPackParam({ Z: true, G: false } as const)
    expect(mixed.decode('ZG')).toEqual({ Z: false, G: true })
    expect(mixed.decode('G')).toEqual({ Z: true, G: true })
    expect(mixed.decode('Z')).toEqual({ Z: false, G: false })
    expect(mixed.decode(undefined)).toEqual({ Z: true, G: false })
  })
})

describe('flagPackParam — round-trip', () => {
  const p = flagPackParam(elvisSpec)
  const cases: { encoded: string | undefined; flags: Record<string, boolean> }[] = [
    { encoded: undefined, flags: { Z: true, H: true, A: true, C: true, L: true, E: true } },
    { encoded: 'Z',       flags: { Z: false, H: true, A: true, C: true, L: true, E: true } },
    { encoded: 'ZH',      flags: { Z: false, H: false, A: true, C: true, L: true, E: true } },
    { encoded: 'ZA',      flags: { Z: false, H: true, A: false, C: true, L: true, E: true } },
    { encoded: 'ZHACLE',  flags: { Z: false, H: false, A: false, C: false, L: false, E: false } },
  ]
  for (const { encoded, flags } of cases) {
    it(`${encoded ?? '(undef)'} ↔ ${JSON.stringify(flags)}`, () => {
      expect(p.decode(encoded)).toEqual(flags)
      expect(p.encode(flags as typeof elvisSpec)).toBe(encoded)
    })
  }

  it('stale order normalizes through decode+encode (HZ → ZH)', () => {
    expect(p.encode(p.decode('HZ') as typeof elvisSpec)).toBe('ZH')
  })

  it('dupes normalize through decode+encode (ZZ → Z)', () => {
    expect(p.encode(p.decode('ZZ') as typeof elvisSpec)).toBe('Z')
  })
})

describe('flagPackParam — validation', () => {
  it('throws on empty-string flag name', () => {
    expect(() => flagPackParam({ '': true } as Record<string, boolean>)).toThrow(
      /flag name must be non-empty/,
    )
  })

  it('multi-character flag names: longest-prefix wins on decode', () => {
    const p = flagPackParam({ AB: true, A: true } as const)
    // 'AB' matches the longer token first
    expect(p.decode('AB')).toEqual({ AB: false, A: true })
    expect(p.decode('A')).toEqual({ AB: true, A: false })
    expect(p.decode('ABA')).toEqual({ AB: false, A: false })
  })
})
