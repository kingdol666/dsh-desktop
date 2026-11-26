import { describe, expect, it } from 'vitest'
import { routeDomains } from '../src/classifier.ts'
import type { DomainConfig } from '../src/types.ts'

function config(id: string, name: string, keywords: string[]): DomainConfig {
  return {
    schemaVersion: 1,
    id,
    name,
    description: '',
    keywords,
    kbRoot: `/tmp/${id}`,
    allowedKinds: ['pdf'],
    defaultKind: 'pdf',
    relatedDomains: id === 'pva' ? ['waxs'] : [],
    priority: 0,
  }
}

const domains = [
  config('pva', 'PVA 光学膜', ['PVA', '聚乙烯醇', '双轴拉伸', '双折射', '结晶度']),
  config('waxs', 'WAXS 方法', ['GIWAXS', 'WAXS', 'SAXS', '钙钛矿']),
  config('generic', '通用高分子', ['纳米颗粒', '银溶胶']),
]

describe('domain classifier', () => {
  it('routes a PVA question with high confidence and related domains', () => {
    const result = routeDomains('PVA 双轴拉伸后的结晶度和双折射怎么解释', domains)
    expect(result.domain).toBe('pva')
    expect(result.needsConfirmation).toBe(false)
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.evidence.some(item => item.includes('PVA'))).toBe(true)
    expect(result.relatedDomains).toContain('waxs')
  })

  it('routes a GIWAXS question to the methods domain', () => {
    const result = routeDomains('GIWAXS 钙钛矿薄膜的掠入射数据怎么处理', domains)
    expect(result.domain).toBe('waxs')
    expect(result.needsConfirmation).toBe(false)
  })

  it('asks for confirmation when the question is ambiguous or empty', () => {
    for (const question of ['这个数据怎么分析', '', 'PVA 和 GIWAXS 都有']) {
      const result = routeDomains(question, domains)
      expect(result.needsConfirmation).toBe(true)
      expect(result.domain).toBeNull()
      expect(result.question).toBeTypeOf('string')
    }
  })

  it('asks for confirmation when the registry is empty', () => {
    const result = routeDomains('PVA', [])
    expect(result.needsConfirmation).toBe(true)
    expect(result.question).toContain('domains/<id>/domain.json')
  })
})
