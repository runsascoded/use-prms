import { describe, it, expect } from 'vitest'
import {
  tagFilterParam,
  effectiveTagState,
  runPassesTagFilters,
  cycleTagFilter,
  DEFAULT_TAG_CYCLE,
  type TagFilters,
  type TagState,
} from './tagFilter.js'

type RunTag =
  | 'AR' | 'MaskGIT' | 'SS' | 'CE' | 'EMD' | 'CE+EMD'
  | 'production' | 'collapsed' | 'bunk' | 'smoke'

const DEFAULTS = { bunk: 'out' } as const

describe('tagFilterParam — encoding', () => {
  const param = tagFilterParam<RunTag>({ defaults: DEFAULTS })

  it('encodes empty Map as undefined (clean URL)', () => {
    expect(param.encode(new Map())).toBeUndefined()
  })

  it('encodes a single `in` tag bare', () => {
    expect(param.encode(new Map([['CE', 'in']]))).toBe('CE')
  })

  it('encodes a single `out` tag with `-` prefix', () => {
    expect(param.encode(new Map([['EMD', 'out']]))).toBe('-EMD')
  })

  it('encodes a non-default `off` tag with `~` prefix', () => {
    // bunk's default is 'out', so 'off' is a real override.
    expect(param.encode(new Map([['bunk', 'off']]))).toBe('~bunk')
  })

  it('omits entries that match the per-tag default', () => {
    // bunk='out' matches default; CE='off' matches default; only EMD survives.
    const filters: TagFilters<RunTag> = new Map([
      ['bunk', 'out'],
      ['CE', 'off'],
      ['EMD', 'in'],
    ])
    expect(param.encode(filters)).toBe('EMD')
  })

  it('encodes multiple overrides joined by spaces (URLSearchParams → `+`)', () => {
    const filters: TagFilters<RunTag> = new Map([
      ['CE', 'in'],
      ['EMD', 'out'],
      ['bunk', 'off'],
    ])
    expect(param.encode(filters)).toBe('CE -EMD ~bunk')
  })

  it('preserves Map insertion order', () => {
    const a: TagFilters<RunTag> = new Map([['CE', 'in'], ['AR', 'in']])
    const b: TagFilters<RunTag> = new Map([['AR', 'in'], ['CE', 'in']])
    expect(param.encode(a)).toBe('CE AR')
    expect(param.encode(b)).toBe('AR CE')
  })

  it('returns undefined when only redundant default entries are present', () => {
    expect(param.encode(new Map([['bunk', 'out']]))).toBeUndefined()
  })

  it('preserves tags with internal `+` (would round-trip through URLSearchParams as `%2B`)', () => {
    expect(param.encode(new Map([['CE+EMD', 'in']]))).toBe('CE+EMD')
  })
})

describe('tagFilterParam — decoding', () => {
  const param = tagFilterParam<RunTag>({ defaults: DEFAULTS })

  it('decodes undefined as empty Map', () => {
    expect([...param.decode(undefined)]).toEqual([])
  })

  it('decodes empty string as empty Map', () => {
    expect([...param.decode('')]).toEqual([])
  })

  it('decodes bare tag as `in`', () => {
    expect([...param.decode('CE')]).toEqual([['CE', 'in']])
  })

  it('decodes `-`-prefixed tag as `out`', () => {
    expect([...param.decode('-EMD')]).toEqual([['EMD', 'out']])
  })

  it('decodes `~`-prefixed tag as `off`', () => {
    expect([...param.decode('~bunk')]).toEqual([['bunk', 'off']])
  })

  it('accepts explicit `+`-prefixed shorthand for `in` (normalized on re-encode)', () => {
    expect([...param.decode('+CE')]).toEqual([['CE', 'in']])
  })

  it('decodes space-separated multi-token strings', () => {
    expect([...param.decode('CE -EMD ~bunk')]).toEqual([
      ['CE', 'in'],
      ['EMD', 'out'],
      ['bunk', 'off'],
    ])
  })

  it('tolerates extra whitespace between tokens', () => {
    expect([...param.decode('CE   -EMD\t~bunk')]).toEqual([
      ['CE', 'in'],
      ['EMD', 'out'],
      ['bunk', 'off'],
    ])
  })

  it('preserves redundant-with-default entries (callers can normalize via cleanUrl)', () => {
    // `~CE` is redundant (default `off`); decode keeps it so diagnostics
    // can flag the URL as `stale` and `cleanUrl({ stale: 'normalize' })`
    // can strip it.
    expect([...param.decode('~CE')]).toEqual([['CE', 'off']])
  })
})

describe('tagFilterParam — round trip', () => {
  type RT = 'a' | 'b' | 'c' | 'd'
  const cases: { name: string; filters: TagFilters<RT>; encoded: string | undefined }[] = [
    { name: 'empty', filters: new Map(), encoded: undefined },
    { name: 'single in', filters: new Map([['a', 'in']]), encoded: 'a' },
    { name: 'single out', filters: new Map([['b', 'out']]), encoded: '-b' },
    { name: 'single off override', filters: new Map([['d', 'off']]), encoded: '~d' },
    {
      name: 'mixed',
      filters: new Map([['a', 'in'], ['b', 'out'], ['d', 'off']]),
      encoded: 'a -b ~d',
    },
  ]
  // `d` defaults to `out`; everything else defaults to `off`.
  const param = tagFilterParam<RT>({ defaults: { d: 'out' } })

  for (const { name, filters, encoded } of cases) {
    it(`encodes ${name}`, () => {
      expect(param.encode(filters)).toBe(encoded)
    })
    it(`decodes ${name}`, () => {
      expect([...param.decode(encoded)]).toEqual([...filters])
    })
  }
})

describe('tagFilterParam — custom prefixes', () => {
  const param = tagFilterParam<'a' | 'b'>({
    prefixes: { in: '+', out: '!', off: '?' },
  })

  it('uses the custom prefixes on encode', () => {
    const filters: TagFilters<'a' | 'b'> = new Map([['a', 'in'], ['b', 'out']])
    expect(param.encode(filters)).toBe('+a !b')
  })

  it('round-trips with custom prefixes', () => {
    expect([...param.decode('+a !b ?a')]).toEqual([
      ['a', 'off'],  // last token wins (a appears twice with different states)
      ['b', 'out'],
    ])
  })

  it('drops bare tokens when no prefix matches (in prefix is non-empty)', () => {
    // With prefixes.in === '+', a bare 'a' matches none of the configured
    // prefixes and is dropped on decode.
    expect([...param.decode('a')]).toEqual([])
  })
})

describe('tagFilterParam — validation', () => {
  it('throws on default tag name starting with reserved prefix', () => {
    expect(() => tagFilterParam<string>({ defaults: { '-x': 'in' } as never }))
      .toThrow(/reserved out-prefix/)
  })

  it('throws on default tag name containing whitespace', () => {
    expect(() => tagFilterParam<string>({ defaults: { 'a b': 'in' } as never }))
      .toThrow(/whitespace/)
  })

  it('throws on empty `out` prefix', () => {
    expect(() => tagFilterParam<string>({ prefixes: { out: '' } }))
      .toThrow(/prefixes.out must be non-empty/)
  })

  it('throws on duplicate prefixes', () => {
    expect(() => tagFilterParam<string>({ prefixes: { out: '!', off: '!' } }))
      .toThrow(/duplicate prefix/)
  })

  it('encode throws on a tag with a reserved-prefix name', () => {
    const param = tagFilterParam<string>()
    expect(() => param.encode(new Map([['-bad', 'in']])))
      .toThrow(/reserved out-prefix/)
  })
})

describe('effectiveTagState', () => {
  it('returns override when present', () => {
    const filters: TagFilters<RunTag> = new Map([['bunk', 'in']])
    expect(effectiveTagState(filters, 'bunk', DEFAULTS)).toBe('in')
  })

  it('falls back to per-tag default when absent', () => {
    expect(effectiveTagState(new Map<RunTag, TagState>(), 'bunk', DEFAULTS)).toBe('out')
  })

  it('falls back to `off` when not in defaults', () => {
    expect(effectiveTagState(new Map<RunTag, TagState>(), 'CE', DEFAULTS)).toBe('off')
  })

  it('treats no-defaults as everything-off', () => {
    expect(effectiveTagState(new Map<RunTag, TagState>(), 'bunk')).toBe('off')
  })
})

describe('runPassesTagFilters', () => {
  const item = { tags: ['CE', 'production'] as RunTag[] }

  it('passes when no constraints apply', () => {
    expect(runPassesTagFilters(item.tags, new Map<RunTag, TagState>())).toBe(true)
  })

  it('per-tag default `out` filters items with that tag', () => {
    const buggy = { tags: ['CE', 'bunk'] as RunTag[] }
    expect(runPassesTagFilters(buggy.tags, new Map<RunTag, TagState>(), DEFAULTS)).toBe(false)
  })

  it('override `off` for default-`out` tag lets the item through', () => {
    const buggy = { tags: ['CE', 'bunk'] as RunTag[] }
    const filters: TagFilters<RunTag> = new Map([['bunk', 'off']])
    expect(runPassesTagFilters(buggy.tags, filters, DEFAULTS)).toBe(true)
  })

  it('`in` requires the tag to be present', () => {
    const filters: TagFilters<RunTag> = new Map([['EMD', 'in']])
    expect(runPassesTagFilters(item.tags, filters, DEFAULTS)).toBe(false)
    expect(runPassesTagFilters(['EMD'], filters, DEFAULTS)).toBe(true)
  })

  it('`out` requires the tag to be absent', () => {
    const filters: TagFilters<RunTag> = new Map([['CE', 'out']])
    expect(runPassesTagFilters(item.tags, filters, DEFAULTS)).toBe(false)
  })

  it('AND-combines multiple constraints', () => {
    const filters: TagFilters<RunTag> = new Map([
      ['production', 'in'],
      ['EMD', 'out'],
    ])
    expect(runPassesTagFilters(item.tags, filters, DEFAULTS)).toBe(true)
    expect(runPassesTagFilters(['production', 'EMD'], filters, DEFAULTS)).toBe(false)
    expect(runPassesTagFilters(['EMD'], filters, DEFAULTS)).toBe(false)
  })
})

describe('cycleTagFilter', () => {
  it('cycles a default-`off` tag: off → in → out → off (deletion at default)', () => {
    let filters: TagFilters<RunTag> = new Map()
    // off → in
    filters = cycleTagFilter(filters, 'CE', DEFAULTS)
    expect([...filters]).toEqual([['CE', 'in']])
    // in → out
    filters = cycleTagFilter(filters, 'CE', DEFAULTS)
    expect([...filters]).toEqual([['CE', 'out']])
    // out → off → matches default → deleted
    filters = cycleTagFilter(filters, 'CE', DEFAULTS)
    expect([...filters]).toEqual([])
  })

  it('cycles a default-`out` tag: out → off → in → out (deletion at default)', () => {
    let filters: TagFilters<RunTag> = new Map()
    // effective 'out' (from default) → next in DEFAULT_TAG_CYCLE is 'off'
    filters = cycleTagFilter(filters, 'bunk', DEFAULTS)
    expect([...filters]).toEqual([['bunk', 'off']])
    // off → in
    filters = cycleTagFilter(filters, 'bunk', DEFAULTS)
    expect([...filters]).toEqual([['bunk', 'in']])
    // in → out → matches default → deleted
    filters = cycleTagFilter(filters, 'bunk', DEFAULTS)
    expect([...filters]).toEqual([])
  })

  it('does not mutate the input Map', () => {
    const original: TagFilters<RunTag> = new Map([['CE', 'in']])
    const before = [...original]
    cycleTagFilter(original, 'CE', DEFAULTS)
    expect([...original]).toEqual(before)
  })

  it('respects custom cycle order', () => {
    // off → out → in → off — visits 'out' first
    const cycle: TagState[] = ['off', 'out', 'in']
    let filters: TagFilters<RunTag> = new Map()
    filters = cycleTagFilter(filters, 'CE', DEFAULTS, cycle)
    expect([...filters]).toEqual([['CE', 'out']])
    filters = cycleTagFilter(filters, 'CE', DEFAULTS, cycle)
    expect([...filters]).toEqual([['CE', 'in']])
    filters = cycleTagFilter(filters, 'CE', DEFAULTS, cycle)
    expect([...filters]).toEqual([])
  })

  it('defaults to DEFAULT_TAG_CYCLE when cycle is omitted', () => {
    expect(DEFAULT_TAG_CYCLE).toEqual(['in', 'out', 'off'])
  })

  it('throws on empty cycle', () => {
    expect(() => cycleTagFilter(new Map<RunTag, TagState>(), 'CE', DEFAULTS, []))
      .toThrow(/non-empty/)
  })
})
