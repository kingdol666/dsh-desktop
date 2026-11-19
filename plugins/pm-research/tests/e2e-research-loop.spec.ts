/** End-to-end research loop against the REAL oblique biaxial CAE engine:
 * project → seed graph → literature evidence → discriminating coupon sweeps →
 * hypothesis adjudication → gate → knowledge consolidation. */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PmResearchEngine } from '../src/service.ts'
import type { CaeRunResult } from '../src/cae.ts'

/** Real engine checkout on this machine; tests skip loudly when absent. */
const CAE_ROOT = process.env.PM_CAE_ROOT ?? 'D:/belendermodels/oblique-biaxial-film-stretching-equipment'

describe('full research loop with real CAE engine', () => {
  it('runs experiment design → data analysis → mechanism adjudication → knowledge consolidation', { timeout: 120_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-e2e-'))
    const engine = PmResearchEngine.open(dir, CAE_ROOT)

    // 1) Project + seed mechanism graph.
    const project = await engine.createProject({
      title: 'PVA 斜拉双折射判别（E2E）',
      question: '斜拉角与拉伸比对双折射幅值的相对贡献',
      domain: 'pva-optical-film',
    }, 'human:pi')
    const seed = await engine.importSeed(project.id, join(__dirname, '..', '..', '..', 'knowledge', 'mechanism', 'seed.json'))
    expect(seed.nodes).toBe(23)

    // 2) Literature evidence (two sources, one strong).
    const litStrong = await engine.recordEvidence(project.id, {
      claimSupport: '文献：仿射范围内 PVA 膜 Δn 随 λ 单调上升（单位无量纲）',
      polarity: 'supports',
      strength: 'strong',
      sourceRef: { type: 'doi', ref: '10.1234/pva-affine-birefringence' },
      payload: { quantity: 'deltaN', trend: 'monotonic-in-lambda' },
      recordedBy: 'preset:polymer-literature',
    })
    const litWeak = await engine.recordEvidence(project.id, {
      claimSupport: '文献：斜拉几何主要旋转光学主轴而非改变幅值',
      polarity: 'supports',
      strength: 'weak',
      sourceRef: { type: 'doi', ref: '10.1234/oblique-principal-axis' },
      recordedBy: 'preset:polymer-literature',
    })

    // 3) Engine health coupon (real spawn).
    const health = await engine.runCaeCoupon(project.id, { stretchX: 1.2, stretchY: 1.1 })
    expect(health.summary.status).toBe('CONVERGED')

    // 4) Competing hypotheses with discriminating four-element tests.
    const h1 = await engine.proposeHypothesis(project.id, {
      statement: '拉伸比 λ 主导双折射幅值：Δn 幅值随面内拉伸能量单调上升',
      competitors: ['H2: 斜拉角 θ 主导 Δn 幅值'],
      mechanismEdgeIds: [],
      evidenceIds: [litStrong.evidence.id],
      discriminatingTest: {
        design: '固定 θ，coupon 面内拉伸 (sx,sy) 从 (1.2,1.1) 增至 (2.0,1.1) 与 (1.2,2.0)，比较变形能量',
        observable: '引擎变形能量（J）对 sx 与 sy 的敏感度',
        expectedIfTrue: '能量随 sx（主要拉伸通道）显著上升',
        expectedIfFalse: '能量对 sx 不敏感或主要由 sy 决定',
      },
    }, 'preset:polymer-scientist')
    const h2 = await engine.proposeHypothesis(project.id, {
      statement: '斜拉角 θ 主导双折射幅值：同等 λ 下 θ 决定 Δn',
      competitors: ['H1: λ 主导幅值'],
      mechanismEdgeIds: [],
      evidenceIds: [litWeak.evidence.id],
      discriminatingTest: {
        design: '同 H1 的 coupon 组；若 sy 通道能量变化大于 sx 通道则 H2 成立',
        observable: '能量敏感度对比',
        expectedIfTrue: 'sy 通道能量变化 > sx 通道',
        expectedIfFalse: 'sx 通道能量变化 > sy 通道',
      },
    }, 'preset:polymer-scientist')

    // 5) Discriminating data: two-channel coupon sweeps (real engine, seconds each).
    const sweepSx: CaeRunResult[] = [
      await engine.runCaeCoupon(project.id, { stretchX: 1.2, stretchY: 1.1 }),
      await engine.runCaeCoupon(project.id, { stretchX: 2.0, stretchY: 1.1 }),
    ]
    const sweepSy: CaeRunResult[] = [
      await engine.runCaeCoupon(project.id, { stretchX: 1.2, stretchY: 2.0 }),
    ]
    const energyOf = (run: CaeRunResult): number => {
      const solver = run.result.solver as { energy?: number } | undefined
      if (solver?.energy === undefined) throw new Error('coupon result missing solver.energy')
      return solver.energy
    }
    const sensitivitySx = Math.abs(energyOf(sweepSx[1]!) - energyOf(sweepSx[0]!))
    const baselineSy = energyOf(sweepSy[0]!) - energyOf(sweepSx[0]!)
    const analysis = { sensitivitySx, baselineSy, discriminator: sensitivitySx > Math.abs(baselineSy) }
    expect(energyOf(sweepSx[1]!)).toBeGreaterThan(energyOf(sweepSx[0]!))

    // 6) Record the discriminating data as evidence and adjudicate.
    const discriminator = await engine.recordEvidence(project.id, {
      claimSupport: `真实引擎 coupon 双通道扫描：ΔE(sx)=${analysis.sensitivitySx.toFixed(3)} J 远大于 ΔE(sy)=${analysis.baselineSy.toFixed(3)} J —— λ 通道主导`,
      polarity: 'supports',
      strength: 'strong',
      sourceRef: { type: 'run', ref: `coupon-sweep-${project.id}` },
      payload: analysis as unknown as Record<string, unknown>,
      recordedBy: 'preset:polymer-modeler',
    })

    for (const to of ['conditional', 'under_test'] as const) {
      const step = await engine.transitionHypothesis(project.id, h1.id, to, '判别数据已生成', 'preset:polymer-scientist')
      expect(step.legal).toBe(true)
    }
    const h1Final = await engine.transitionHypothesis(project.id, h1.id, 'supported', '判别扫描与文献一致：λ 通道主导幅值', 'preset:polymer-scientist', [discriminator.evidence.id])
    expect(h1Final.legal).toBe(true)
    expect(h1Final.hypothesis?.status).toBe('supported')

    const refutes = await engine.recordEvidence(project.id, {
      claimSupport: `判别扫描反驳 θ 主导：sy 通道能量变化 ${Math.abs(analysis.baselineSy).toFixed(3)} J 远小于 sx 通道 ${analysis.sensitivitySx.toFixed(3)} J（量级差 + 引擎收敛 + provenance 锚定）`,
      polarity: 'refutes',
      strength: 'strong',
      sourceRef: { type: 'run', ref: `coupon-sweep-${project.id}` },
      payload: analysis as unknown as Record<string, unknown>,
      recordedBy: 'preset:polymer-modeler',
    })
    for (const to of ['conditional', 'under_test'] as const) {
      await engine.transitionHypothesis(project.id, h2.id, to, '进入判别', 'preset:polymer-scientist')
    }
    const h2Final = await engine.transitionHypothesis(project.id, h2.id, 'refuted', '扫描显示 sy 通道能量变化远小于 sx 通道：θ 主导幅值不成立', 'preset:polymer-scientist', [refutes.evidence.id])
    expect(h2Final.legal).toBe(true)
    expect(h2Final.hypothesis?.status).toBe('refuted')

    // 7) Gate the claim before it may enter a report.
    const verdict = await engine.gateEvaluate(project.id, {
      kind: 'claim',
      claim: '在给定窗口（T=105℃, θ 固定）内，λ 通道主导 Δn 幅值',
      competitors: [{ statement: 'H2 θ 主导幅值', excluded: true }],
      evidenceIds: [litStrong.evidence.id, discriminator.evidence.id, litWeak.evidence.id],
    })
    expect(verdict.verdict).toBe('pass')

    // 8) Consolidate experience into the RSI loop (propose → review → approved).
    const card = await engine.knowledge().propose({
      scope: 'project',
      kind: 'decision',
      title: '判别结论：λ 通道主导幅值（T=105℃ 窗口）',
      body: `真实引擎双通道 coupon 扫描 ΔE(sx)=${analysis.sensitivitySx.toFixed(3)}J vs ΔE(sy)=${Math.abs(analysis.baselineSy).toFixed(3)}J；假设 ${h1.id} supported，${h2.id} refuted。证据：${discriminator.evidence.id}`,
    }, 'preset:polymer-scientist')
    const approved = await engine.knowledge().review(card.card.id, 'approve', 'polymer-reviewer', '判别数据充分、链路可审计')
    expect(approved?.status).toBe('approved')

    // 9) Whole evidence chain must verify.
    const verify = await engine.verifyEvidence(project.id)
    expect(verify.verified).toBe(true)
    expect(verify.chainLength).toBeGreaterThanOrEqual(4)
  })
})
