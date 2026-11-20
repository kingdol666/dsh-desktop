import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PmResearchEngine } from '../src/service.ts'

const DOMAIN = 'pva-optical-film' as const

describe('research engine lifecycle', () => {
  it('runs project → evidence → hypothesis → gated transition end to end', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-engine-'))
    const engine = PmResearchEngine.open(dir)

    const project = await engine.createProject({
      title: 'PVA 斜拉双折射判别',
      question: '斜拉角与拉伸比对双折射主轴与幅值的相对贡献',
      domain: DOMAIN,
    }, 'human:pi')
    expect(project.id).toMatch(/^PR-1-[0-9a-f]{4}$/u)

    const strong = await engine.recordEvidence(project.id, {
      claimSupport: 'CAE sweep shows Δn rising with draw ratio at 105℃',
      polarity: 'supports',
      strength: 'strong',
      sourceRef: { type: 'run', ref: 'cae-20260913-machine-run' },
      payload: { deltaN: 0.023, temperatureC: 105, drawRatio: 3.2 },
      recordedBy: 'preset:polymer-modeler',
    })
    expect(strong.deduped).toBe(false)

    const second = await engine.recordEvidence(project.id, {
      claimSupport: 'Literature reports the same monotonic trend for PVA films',
      polarity: 'supports',
      strength: 'weak',
      sourceRef: { type: 'doi', ref: '10.1234/pva-orientation' },
      recordedBy: 'preset:polymer-literature',
    })

    const dedup = await engine.recordEvidence(project.id, {
      claimSupport: 'Literature reports the same monotonic trend for PVA films',
      polarity: 'supports',
      strength: 'weak',
      sourceRef: { type: 'doi', ref: '10.1234/pva-orientation' },
      recordedBy: 'preset:polymer-literature',
    })
    expect(dedup.deduped).toBe(true)
    expect(dedup.evidence.id).toBe(second.evidence.id)

    const verify = await engine.verifyEvidence(project.id)
    expect(verify).toEqual({ verified: true, chainLength: 2 })

    const hypothesis = await engine.proposeHypothesis(project.id, {
      statement: '拉伸比主导双折射幅值，斜拉角主导主轴旋转',
      competitors: ['H2: 温度主导幅值'],
      mechanismEdgeIds: [],
      evidenceIds: [strong.evidence.id, second.evidence.id],
      discriminatingTest: {
        design: '固定温度扫拉伸比 vs 固定拉伸比扫斜拉角',
        observable: 'Δn 幅值与主轴角',
        expectedIfTrue: 'Δn 随 λ 单调上升而角度仅影响主轴',
        expectedIfFalse: 'Δn 对斜拉角敏感',
      },
    }, 'preset:polymer-scientist')
    expect(hypothesis.status).toBe('proposed')
    expect(hypothesis.id).toMatch(/^HY-1-[0-9a-f]{4}$/u)

    for (const to of ['conditional', 'under_test'] as const) {
      const step = await engine.transitionHypothesis(project.id, hypothesis.id, to, '进入下一阶段', 'preset:polymer-scientist')
      expect(step.legal).toBe(true)
    }
    const final = await engine.transitionHypothesis(project.id, hypothesis.id, 'supported', '判别实验支持该机理', 'preset:polymer-scientist')
    expect(final.legal).toBe(true)
    expect(final.hypothesis?.status).toBe('supported')
    expect(final.hypothesis?.transitions).toHaveLength(4)
  })

  it('blocks a supported transition when the discriminating test is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-engine-'))
    const engine = PmResearchEngine.open(dir)
    const project = await engine.createProject({ title: 't', question: 'q', domain: DOMAIN }, 'human:pi')
    const strong = await engine.recordEvidence(project.id, {
      claimSupport: 'A',
      polarity: 'supports',
      strength: 'strong',
      sourceRef: { type: 'run', ref: 'r1' },
      recordedBy: 'preset:polymer-modeler',
    })
    const weak = await engine.recordEvidence(project.id, {
      claimSupport: 'B',
      polarity: 'supports',
      strength: 'weak',
      sourceRef: { type: 'run', ref: 'r2' },
      recordedBy: 'preset:polymer-modeler',
    })
    const hypothesis = await engine.proposeHypothesis(project.id, {
      statement: 'no test attached',
      competitors: [],
      mechanismEdgeIds: [],
      evidenceIds: [strong.evidence.id, weak.evidence.id],
    }, 'preset:polymer-scientist')
    for (const to of ['conditional', 'under_test'] as const) {
      const step = await engine.transitionHypothesis(project.id, hypothesis.id, to, 'advance', 'preset:polymer-scientist')
      expect(step.legal).toBe(true)
    }
    const verdict = await engine.transitionHypothesis(project.id, hypothesis.id, 'supported', 'wants to conclude', 'preset:polymer-scientist')
    expect(verdict.legal).toBe(false)
    expect(verdict.reason).toContain('discriminating test')
  })

  it('resolves gate evidence from the ledger, so callers cannot invent strengths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-engine-'))
    const engine = PmResearchEngine.open(dir)
    const project = await engine.createProject({ title: 't2', question: 'q2', domain: DOMAIN }, 'human:pi')
    const hypothesis = await engine.proposeHypothesis(project.id, {
      statement: 'cites nothing yet',
      competitors: [],
      mechanismEdgeIds: [],
      evidenceIds: ['EV-999-ffff'],
      discriminatingTest: { design: 'd', observable: 'o', expectedIfTrue: 't', expectedIfFalse: 'f' },
    }, 'preset:polymer-scientist')
    for (const to of ['conditional', 'under_test'] as const) {
      const step = await engine.transitionHypothesis(project.id, hypothesis.id, to, 'advance', 'preset:polymer-scientist')
      expect(step.legal).toBe(true)
    }
    const verdict = await engine.transitionHypothesis(project.id, hypothesis.id, 'supported', 'no real evidence', 'preset:polymer-scientist')
    expect(verdict.legal).toBe(false)
    // The invented id does not resolve against the ledger, so the scientific
    // gate rejects the conclusion before the count rule can even see 2 items.
    expect(verdict.reason).toMatch(/no bound evidence|at least 2 evidence/u)
  })
})
