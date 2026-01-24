import { describe, it, expect, vi } from 'vitest'
import {
  boolParam,
  stringParam,
  defStringParam,
  intParam,
  optIntParam,
  enumParam,
  stringsParam,
  numberArrayParam,
  paginationParam,
  codeParam,
  codesParam,
} from './params.js'
import { floatParam } from './float.js'

describe('boolParam', () => {
  it('encodes true as empty string', () => {
    expect(boolParam.encode(true)).toBe('')
  })

  it('encodes false as undefined', () => {
    expect(boolParam.encode(false)).toBeUndefined()
  })

  it('decodes empty string as true', () => {
    expect(boolParam.decode('')).toBe(true)
  })

  it('decodes undefined as false', () => {
    expect(boolParam.decode(undefined)).toBe(false)
  })

  it('decodes any string as true', () => {
    expect(boolParam.decode('anything')).toBe(true)
  })
})

describe('stringParam', () => {
  it('encodes non-default value', () => {
    const param = stringParam()
    expect(param.encode('hello')).toBe('hello')
  })

  it('encodes default value as undefined', () => {
    const param = stringParam('default')
    expect(param.encode('default')).toBeUndefined()
  })

  it('decodes string value', () => {
    const param = stringParam()
    expect(param.decode('hello')).toBe('hello')
  })

  it('decodes undefined as init value', () => {
    const param = stringParam('default')
    expect(param.decode(undefined)).toBe('default')
  })

  it('decodes empty string as empty string', () => {
    const param = stringParam()
    expect(param.decode('')).toBe('')
  })
})

describe('defStringParam', () => {
  it('encodes non-default value', () => {
    const param = defStringParam('default')
    expect(param.encode('other')).toBe('other')
  })

  it('encodes default value as undefined', () => {
    const param = defStringParam('default')
    expect(param.encode('default')).toBeUndefined()
  })

  it('decodes string value', () => {
    const param = defStringParam('default')
    expect(param.decode('other')).toBe('other')
  })

  it('decodes undefined as default', () => {
    const param = defStringParam('default')
    expect(param.decode(undefined)).toBe('default')
  })
})

describe('intParam', () => {
  it('encodes non-default value', () => {
    const param = intParam(0)
    expect(param.encode(42)).toBe('42')
  })

  it('encodes default value as undefined', () => {
    const param = intParam(10)
    expect(param.encode(10)).toBeUndefined()
  })

  it('decodes string to integer', () => {
    const param = intParam(0)
    expect(param.decode('42')).toBe(42)
  })

  it('decodes undefined as default', () => {
    const param = intParam(10)
    expect(param.decode(undefined)).toBe(10)
  })

  it('handles negative numbers', () => {
    const param = intParam(0)
    expect(param.encode(-5)).toBe('-5')
    expect(param.decode('-5')).toBe(-5)
  })
})

describe('floatParam', () => {
  describe('string encoding', () => {
    it('encodes non-default value', () => {
      const param = floatParam({ default: 0, encoding: 'string' })
      expect(param.encode(3.14)).toBe('3.14')
    })

    it('encodes default value as undefined', () => {
      const param = floatParam({ default: 1.5, encoding: 'string' })
      expect(param.encode(1.5)).toBeUndefined()
    })

    it('decodes string to float', () => {
      const param = floatParam({ default: 0, encoding: 'string' })
      expect(param.decode('3.14')).toBeCloseTo(3.14)
    })

    it('decodes undefined as default', () => {
      const param = floatParam({ default: 1.5, encoding: 'string' })
      expect(param.decode(undefined)).toBe(1.5)
    })

    it('truncates with decimals option', () => {
      const param = floatParam({ default: 0, encoding: 'string', decimals: 2 })
      expect(param.encode(3.14159)).toBe('3.14')
    })
  })

  describe('base64 encoding (default)', () => {
    it('encodes to base64 by default', () => {
      const param = floatParam(0)
      const encoded = param.encode(Math.PI)
      expect(encoded).toBeDefined()
      expect(encoded).not.toBe(Math.PI.toString())
      expect(encoded!.length).toBe(11) // lossless: 8 bytes = 11 base64 chars
    })

    it('roundtrips exactly (lossless)', () => {
      const param = floatParam(0)
      const encoded = param.encode(Math.PI)
      expect(param.decode(encoded)).toBe(Math.PI)
    })

    it('encodes default value as undefined', () => {
      const param = floatParam(0)
      expect(param.encode(0)).toBeUndefined()
    })

    it('decodes undefined as default', () => {
      const param = floatParam(1.5)
      expect(param.decode(undefined)).toBe(1.5)
    })
  })

  describe('lossy base64 encoding', () => {
    it('encodes with exp+mant options', () => {
      const param = floatParam({ default: 0, encoding: 'base64', exp: 5, mant: 22 })
      const encoded = param.encode(Math.PI)
      expect(encoded).toBeDefined()
      expect(encoded!.length).toBeLessThan(11) // lossy is shorter
    })

    it('encodes with precision string', () => {
      const param = floatParam({ default: 0, encoding: 'base64', precision: '5+22' })
      const encoded = param.encode(Math.PI)
      expect(encoded).toBeDefined()
      expect(encoded!.length).toBeLessThan(11)
    })

    it('roundtrips approximately', () => {
      const param = floatParam({ default: 0, encoding: 'base64', exp: 5, mant: 22 })
      const encoded = param.encode(Math.PI)
      const decoded = param.decode(encoded)
      expect(decoded).toBeCloseTo(Math.PI, 5) // ~7 digits precision
    })
  })
})

describe('optIntParam', () => {
  it('encodes number value', () => {
    expect(optIntParam.encode(42)).toBe('42')
  })

  it('encodes null as undefined', () => {
    expect(optIntParam.encode(null)).toBeUndefined()
  })

  it('decodes string to integer', () => {
    expect(optIntParam.decode('42')).toBe(42)
  })

  it('decodes undefined as null', () => {
    expect(optIntParam.decode(undefined)).toBeNull()
  })
})

describe('enumParam', () => {
  const themes = ['light', 'dark', 'auto'] as const
  type Theme = typeof themes[number]

  it('encodes non-default value', () => {
    const param = enumParam<Theme>('light', themes)
    expect(param.encode('dark')).toBe('dark')
  })

  it('encodes default value as undefined', () => {
    const param = enumParam<Theme>('light', themes)
    expect(param.encode('light')).toBeUndefined()
  })

  it('decodes valid value', () => {
    const param = enumParam<Theme>('light', themes)
    expect(param.decode('dark')).toBe('dark')
  })

  it('decodes undefined as default', () => {
    const param = enumParam<Theme>('light', themes)
    expect(param.decode(undefined)).toBe('light')
  })

  it('decodes invalid value as default with warning', () => {
    const param = enumParam<Theme>('light', themes)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(param.decode('invalid')).toBe('light')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('warns on encode of invalid value', () => {
    const param = enumParam<Theme>('light', themes)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(param.encode('invalid' as Theme)).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('stringsParam', () => {
  it('encodes array with default delimiter (space)', () => {
    const param = stringsParam()
    expect(param.encode(['a', 'b', 'c'])).toBe('a b c')
  })

  it('encodes array with custom delimiter', () => {
    const param = stringsParam([], ',')
    expect(param.encode(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('encodes default value as undefined', () => {
    const param = stringsParam(['a', 'b'])
    expect(param.encode(['a', 'b'])).toBeUndefined()
  })

  it('encodes empty array as empty string', () => {
    const param = stringsParam(['a'])
    expect(param.encode([])).toBe('')
  })

  it('decodes string to array', () => {
    const param = stringsParam()
    expect(param.decode('a b c')).toEqual(['a', 'b', 'c'])
  })

  it('decodes undefined as default', () => {
    const param = stringsParam(['x', 'y'])
    expect(param.decode(undefined)).toEqual(['x', 'y'])
  })

  it('decodes empty string as empty array', () => {
    const param = stringsParam()
    expect(param.decode('')).toEqual([])
  })
})

describe('numberArrayParam', () => {
  it('encodes array with comma delimiter', () => {
    const param = numberArrayParam()
    expect(param.encode([1, 2, 3])).toBe('1,2,3')
  })

  it('encodes default value as undefined', () => {
    const param = numberArrayParam([1, 2])
    expect(param.encode([1, 2])).toBeUndefined()
  })

  it('decodes string to number array', () => {
    const param = numberArrayParam()
    expect(param.decode('1,2,3')).toEqual([1, 2, 3])
  })

  it('decodes floats', () => {
    const param = numberArrayParam()
    expect(param.decode('1.5,2.7')).toEqual([1.5, 2.7])
  })

  it('decodes undefined as default', () => {
    const param = numberArrayParam([1, 2])
    expect(param.decode(undefined)).toEqual([1, 2])
  })

  it('decodes empty string as empty array', () => {
    const param = numberArrayParam()
    expect(param.decode('')).toEqual([])
  })
})

describe('paginationParam', () => {
  it('encodes default state as undefined', () => {
    const param = paginationParam(20)
    expect(param.encode({ offset: 0, pageSize: 20 })).toBeUndefined()
  })

  it('encodes offset only when pageSize is default', () => {
    const param = paginationParam(20)
    expect(param.encode({ offset: 100, pageSize: 20 })).toBe('100')
  })

  it('encodes pageSize only when offset is 0', () => {
    const param = paginationParam(20)
    expect(param.encode({ offset: 0, pageSize: 50 })).toBe(' 50')
  })

  it('encodes both offset and pageSize', () => {
    const param = paginationParam(20)
    expect(param.encode({ offset: 100, pageSize: 50 })).toBe('100 50')
  })

  it('decodes undefined as default', () => {
    const param = paginationParam(20)
    expect(param.decode(undefined)).toEqual({ offset: 0, pageSize: 20 })
  })

  it('decodes offset only', () => {
    const param = paginationParam(20)
    expect(param.decode('100')).toEqual({ offset: 100, pageSize: 20 })
  })

  it('decodes pageSize only (space prefix)', () => {
    const param = paginationParam(20)
    expect(param.decode(' 50')).toEqual({ offset: 0, pageSize: 50 })
  })

  it('decodes both offset and pageSize', () => {
    const param = paginationParam(20)
    expect(param.decode('100 50')).toEqual({ offset: 100, pageSize: 50 })
  })

  it('validates pageSize against allowed values', () => {
    const param = paginationParam(20, [10, 20, 50])
    expect(param.decode('0 30')).toEqual({ offset: 0, pageSize: 20 })
    expect(param.decode('0 50')).toEqual({ offset: 0, pageSize: 50 })
  })
})

describe('codeParam', () => {
  const codeMap = { Rides: 'r', Minutes: 'm' } as const
  type Metric = keyof typeof codeMap

  it('encodes default value as undefined', () => {
    const param = codeParam<Metric>('Rides', codeMap)
    expect(param.encode('Rides')).toBeUndefined()
  })

  it('encodes non-default value as code', () => {
    const param = codeParam<Metric>('Rides', codeMap)
    expect(param.encode('Minutes')).toBe('m')
  })

  it('decodes undefined as default', () => {
    const param = codeParam<Metric>('Rides', codeMap)
    expect(param.decode(undefined)).toBe('Rides')
  })

  it('decodes code to value', () => {
    const param = codeParam<Metric>('Rides', codeMap)
    expect(param.decode('m')).toBe('Minutes')
  })

  it('decodes unknown code as default', () => {
    const param = codeParam<Metric>('Rides', codeMap)
    expect(param.decode('x')).toBe('Rides')
  })

  it('works with array syntax', () => {
    const param = codeParam<Metric>('Rides', [['Rides', 'r'], ['Minutes', 'm']])
    expect(param.encode('Minutes')).toBe('m')
    expect(param.decode('m')).toBe('Minutes')
  })
})

describe('codesParam', () => {
  const allValues = ['NYC', 'JC', 'HOB'] as const
  type Region = typeof allValues[number]
  const codeMap = { NYC: 'n', JC: 'j', HOB: 'h' } as const

  it('encodes all values as undefined', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.encode(['NYC', 'JC', 'HOB'])).toBeUndefined()
  })

  it('encodes subset as concatenated codes', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.encode(['NYC', 'JC'])).toBe('nj')
  })

  it('encodes empty array as empty string', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.encode([])).toBe('')
  })

  it('decodes undefined as all values', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.decode(undefined)).toEqual(['NYC', 'JC', 'HOB'])
  })

  it('decodes codes to values', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.decode('nj')).toEqual(['NYC', 'JC'])
  })

  it('decodes empty string as empty array', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.decode('')).toEqual([])
  })

  it('works with custom separator', () => {
    const param = codesParam<Region>(allValues, codeMap, ',')
    expect(param.encode(['NYC', 'JC'])).toBe('n,j')
    expect(param.decode('n,j')).toEqual(['NYC', 'JC'])
  })

  it('filters unknown codes', () => {
    const param = codesParam<Region>(allValues, codeMap)
    expect(param.decode('nxj')).toEqual(['NYC', 'JC'])
  })
})

describe('roundtrip encoding', () => {
  it('boolParam roundtrips', () => {
    expect(boolParam.decode(boolParam.encode(true))).toBe(true)
    expect(boolParam.decode(boolParam.encode(false))).toBe(false)
  })

  it('intParam roundtrips', () => {
    const param = intParam(0)
    expect(param.decode(param.encode(42))).toBe(42)
    expect(param.decode(param.encode(0))).toBe(0)
  })

  it('stringsParam roundtrips', () => {
    const param = stringsParam()
    expect(param.decode(param.encode(['a', 'b', 'c']))).toEqual(['a', 'b', 'c'])
  })

  it('paginationParam roundtrips', () => {
    const param = paginationParam(20)
    const values = [
      { offset: 0, pageSize: 20 },
      { offset: 100, pageSize: 20 },
      { offset: 0, pageSize: 50 },
      { offset: 100, pageSize: 50 },
    ]
    for (const value of values) {
      expect(param.decode(param.encode(value))).toEqual(value)
    }
  })

  it('codeParam roundtrips', () => {
    const param = codeParam('Rides', { Rides: 'r', Minutes: 'm' })
    expect(param.decode(param.encode('Rides'))).toBe('Rides')
    expect(param.decode(param.encode('Minutes'))).toBe('Minutes')
  })
})
