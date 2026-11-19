import { describe, expect, it } from 'vitest'
import { attemptHypothesisMove, conclusionGateSummary } from '../src/index.ts'
import type { DiscriminatingTest } from '@polymechanism/pm-domain'

const test: DiscriminatingTest = {
  design: 'vary draw ratio at fixed temperature',
  observable: 'Hermans orientation factor',
  expectedIfTrue: 'f rises monotonically with λ',
  expectedIfFalse: 'f stays flat',
}

const strongSupport = { id: 'EV-1-abcd', polarity: 'supports' as const, strength: 'strong' as const }
const weakSupport = { id: 'EV-2-abcd', polarity: 'supports' as const, strength: 'weak' as const }
const strongRefute = { id: 'EV-3-abcd', polarity: 'refutes' as const, strength: 'strong' as const }

function move(overrides: Partial<Parameters<typeof attemptHypothesisMove>[0]>) {
  return attemptHypothesisMove({
    from: 'under_test',
    to: 'supported',
    rationale: 'CAE sweep discriminates the mechanisms',
    evidence: [strongSupport, weakSupport],
    actor: 'polymer-scientist',
    at: '2026-11-20T00:00:00.000Z',
    discriminatingTest: test,
    ...overrides,
  })
}

describe('hypothesis machine', () => {
  it('allows a conclusion when the gate and discriminating test are satisfied', () => {
    const verdict = move({})
    expect(verdict.legal).toBe(true)
    if (verdict.legal) {
      expect(verdict.transition.to).toBe('supported')
      expect(verdict.transition.evidenceIds).toEqual(['EV-1-abcd', 'EV-2-abcd'])
    }
  })

  it('blocks supported without a discriminating test', () => {
    const verdict = move({ discriminatingTest: undefined })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('discriminating test') })
  })

  it('blocks supported with only weak evidence', () => {
    const verdict = move({ evidence: [weakSupport, { ...weakSupport, id: 'EV-4-abcd' }] })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('at least 1 strong') })
  })

  it('blocks supported when evidence polarity never supports', () => {
    const verdict = move({ evidence: [strongRefute, { ...strongRefute, id: 'EV-5-abcd' }], to: 'supported' })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('supports-polarity') })
  })

  it('blocks refuted without refuting evidence', () => {
    const verdict = move({ to: 'refuted' })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('refutes-polarity') })
  })

  it('rejects structurally illegal transitions like proposed → supported', () => {
    const verdict = move({ from: 'proposed' })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('not legal') })
  })

  it('rejects archived as a source state', () => {
    const verdict = move({ from: 'archived' })
    expect(verdict).toMatchObject({ legal: false })
  })

  it('requires a non-empty rationale', () => {
    const verdict = move({ rationale: '   ' })
    expect(verdict).toMatchObject({ legal: false, reason: expect.stringContaining('rationale') })
  })

  it('summarizes the conclusion gate', () => {
    expect(conclusionGateSummary([strongSupport, weakSupport])).toEqual({ count: 2, strong: 1, satisfied: true })
    expect(conclusionGateSummary([weakSupport])).toEqual({ count: 1, strong: 0, satisfied: false })
  })
})
