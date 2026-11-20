import { describe, expect, it } from 'vitest'
import { toToolJson } from '../src/tool-json.ts'

describe('tool JSON projection', () => {
  it('strips absent fields and turns non-finite numbers into null', () => {
    const projected = toToolJson({
      finite: 1.5,
      nan: Number.NaN,
      infinite: Number.POSITIVE_INFINITY,
      absent: undefined,
      nested: [{ value: Number.NaN }],
    })
    expect(projected).toEqual({
      finite: 1.5,
      nan: null,
      infinite: null,
      nested: [{ value: null }],
    })
  })
})
