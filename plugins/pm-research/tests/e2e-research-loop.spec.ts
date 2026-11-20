/** End-to-end research loop against the REAL polymer simulation engine and the
 * REAL characterization bridge: project → seed graph → literature evidence →
 * simulation prediction (analytic affine orientation) → characterization
 * measurement (Hermans) → hypothesis adjudication → gate → knowledge. */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PmResearchEngine } from '../src/service.ts'
import { runScience } from '../src/science.ts'
import { registerSimTools } from '../src/tools-sim.ts'
import { registerScienceTools } from '../src/tools-science.ts'

interface RegisteredTool {
  execute(args: unknown, exec: unknown): Promise<unknown>
}

function registerBoth(engine: PmResearchEngine): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerSimTools(ctx, engine)
  registerScienceTools(ctx, engine)
  return tools
}

describe('full research loop with the polymer simulation engine', () => {
  it('runs prediction → measurement → mechanism adjudication → knowledge consolidation', { timeout: 180_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-e2e-'))
    try {
      const engine = PmResearchEngine.open(dir)
      const tools = registerBoth(engine)
      const exec = {
        agent: { session: { header: { cwd: dir, agentPreset: 'polymer-scientist' } } },
        signal: new AbortController().signal,
      }

      // 1) Project + seed mechanism graph.
      const project = await engine.createProject({
        title: 'PVA 取向-双折射判别（仿真 E2E）',
        question: '拉伸比是否通过仿射链取向主导双折射',
        domain: 'pva-optical-film',
      }, 'human:pi')
      const seed = await engine.importSeed(project.id, join(__dirname, '..', '..', '..', 'knowledge', 'mechanism', 'seed.json'))
      expect(seed.nodes).toBe(23)

      // 2) Literature evidence (one strong, one weak).
      const litStrong = await engine.recordEvidence(project.id, {
        claimSupport: '文献：仿射范围内 PVA 膜 Δn 随 λ 单调上升（单位无量纲）',
        polarity: 'supports',
        strength: 'strong',
        sourceRef: { type: 'doi', ref: '10.1234/pva-affine-birefringence' },
        payload: { quantity: 'deltaN', trend: 'monotonic-in-lambda' },
        recordedBy: 'preset:polymer-literature',
      })
      const litWeak = await engine.recordEvidence(project.id, {
        claimSupport: '文献：高拉伸段取向增长趋于饱和，仿射上界不再可达',
        polarity: 'supports',
        strength: 'weak',
        sourceRef: { type: 'doi', ref: '10.1234/orientation-saturation' },
        recordedBy: 'preset:polymer-literature',
      })

      // 3) Simulation PREDICTION through the real analytic engine:
      //    affine orientation at λ=2 → f = 0.7 exactly (8-chain/affine physics).
      const prediction = await tools.get('pm_sim_chain_stats')!.execute({
        projectId: project.id,
        beadsPerChain: 100,
        kuhnLengthNm: 1.0,
        stretchX: 2.0,
        claimSupport: '仿真预测（仿射网络模型, N=100）：λ=2 时 Hermans 取向因子上界 f=0.70',
        polarity: 'neutral',
        strength: 'moderate',
      }, exec) as { ok: boolean; data?: { simulation: { orientation: { orientationF: number } } } }
      expect(prediction.ok, JSON.stringify(prediction)).toBe(true)
      expect(prediction.data?.simulation.orientation.orientationF).toBeCloseTo(0.7, 6)
      const predictionEvidence = (await engine.queryEvidence(project.id)).at(-1)!
      expect(predictionEvidence.payload).toMatchObject({ simulation: 'pm_sim_chain_stats' })

      // 4) Competing hypotheses with discriminating four-element tests.
      const h1 = await engine.proposeHypothesis(project.id, {
        statement: '拉伸比 λ 通过仿射链取向主导双折射：f(λ=2) 落在仿射预测窗 [0.55, 0.70]',
        competitors: ['H2: 取向在高拉伸段饱和，f(λ=2) < 0.2（与仿射预测明显偏离）'],
        mechanismEdgeIds: [],
        evidenceIds: [litStrong.evidence.id],
        discriminatingTest: {
          design: 'λ=2 单轴拉伸；方位角扫描测 Hermans f；对照 pm_sim_chain_stats 仿射预测',
          observable: 'Hermans 取向因子 f（方位角 WAXS 扫描）',
          expectedIfTrue: '实测 f ∈ [0.55, 0.70]，接近但不超过仿射上界 0.70',
          expectedIfFalse: '实测 f < 0.2，与仿射预测明显偏离',
        },
      }, 'preset:polymer-scientist')
      const h2 = await engine.proposeHypothesis(project.id, {
        statement: '取向饱和：f(λ=2) < 0.2，仿射网络模型不适用',
        competitors: ['H1: 仿射取向主导'],
        mechanismEdgeIds: [],
        evidenceIds: [litWeak.evidence.id],
        discriminatingTest: {
          design: '同 H1 的方位角测量',
          observable: 'Hermans 取向因子 f',
          expectedIfTrue: '实测 f < 0.2',
          expectedIfFalse: '实测 f 进入仿射预测窗',
        },
      }, 'preset:polymer-scientist')

      // 5) MEASUREMENT through the real characterization bridge: azimuth CSV
      //    generated from an orientation distribution with truth f ≈ 0.66 —
      //    inside the affine window, far above the saturation bound.
      const dataDir = join(dir, 'data')
      await mkdir(dataDir, { recursive: true })
      const c = 1.1 // I(φ) = 1 + c·cos(2φ) → f = 0.25 + 0.375c ≈ 0.6625
      const lines = ['azimuth_deg,intensity']
      for (let i = 0; i <= 180; i += 2) {
        const phi = (i * Math.PI) / 180
        const intensity = 1 + c * Math.cos(2 * phi)
        lines.push(`${i},${intensity.toFixed(6)}`)
      }
      await writeFile(join(dataDir, 'azimuth.csv'), `${lines.join('\n')}\n`, 'utf8')
      const hermans = await tools.get('pm_hermans_analyze')!.execute({
        projectId: project.id,
        dataPath: 'data/azimuth.csv',
        azimuthColumn: 'azimuth_deg',
        intensityColumn: 'intensity',
      }, exec) as { ok: boolean; data?: { analysis: { hermansFactor: number }; evidence: { id: string } } }
      expect(hermans.ok, JSON.stringify(hermans)).toBe(true)
      const measuredF = hermans.data!.analysis.hermansFactor
      expect(measuredF).toBeGreaterThan(0.55)
      expect(measuredF).toBeLessThan(0.70)
      const measurement = hermans.data!.evidence

      // 6) Adjudicate: H1 supported by prediction + measurement, H2 refuted.
      for (const to of ['conditional', 'under_test'] as const) {
        const step = await engine.transitionHypothesis(project.id, h1.id, to, '判别测量已生成', 'preset:polymer-scientist')
        expect(step.legal).toBe(true)
      }
      const h1Final = await engine.transitionHypothesis(
        project.id,
        h1.id,
        'supported',
        `实测 f=${measuredF.toFixed(4)} 落在仿射预测窗且不超过上界 0.70（预测证据 + 实测证据一致）`,
        'preset:polymer-scientist',
        [predictionEvidence.id, measurement.id],
      )
      expect(h1Final.legal).toBe(true)
      expect(h1Final.hypothesis?.status).toBe('supported')

      const refutes = await engine.recordEvidence(project.id, {
        claimSupport: `实测 f=${measuredF.toFixed(4)} 远高于饱和假设上界 0.2：取向饱和不成立`,
        polarity: 'refutes',
        strength: 'strong',
        sourceRef: { type: 'file', ref: join(dataDir, 'azimuth.csv') },
        payload: { measuredF, saturationBound: 0.2 },
        recordedBy: 'preset:polymer-characterization',
      })
      for (const to of ['conditional', 'under_test'] as const) {
        await engine.transitionHypothesis(project.id, h2.id, to, '进入判别', 'preset:polymer-scientist')
      }
      const h2Final = await engine.transitionHypothesis(project.id, h2.id, 'refuted', '实测取向进入仿射预测窗：饱和假设被反驳', 'preset:polymer-scientist', [refutes.evidence.id])
      expect(h2Final.legal).toBe(true)
      expect(h2Final.hypothesis?.status).toBe('refuted')

      // 7) Gate the claim before it may enter a report.
      const verdict = await engine.gateEvaluate(project.id, {
        kind: 'claim',
        claim: '在 λ=2 单轴窗口内，仿射链取向主导 PVA 膜双折射的取向来源',
        competitors: [{ statement: 'H2 取向饱和', excluded: true }],
        evidenceIds: [litStrong.evidence.id, predictionEvidence.id, measurement.id],
      })
      expect(verdict.verdict).toBe('pass')

      // 8) Consolidate experience into the RSI loop (propose → review → approved).
      const card = await engine.knowledge().propose({
        scope: 'project',
        kind: 'decision',
        title: '判别结论：仿射取向主导（λ=2 窗口）',
        body: `仿真预测 f=0.70（pm_sim_chain_stats），实测 f=${measuredF.toFixed(4)}（pm_hermans_analyze）；假设 ${h1.id} supported，${h2.id} refuted。证据：${predictionEvidence.id}, ${measurement.id}`,
      }, 'preset:polymer-scientist')
      const approved = await engine.knowledge().review(card.card.id, 'approve', 'polymer-reviewer', '预测-实测闭环完整、链路可审计')
      expect(approved?.status).toBe('approved')

      // 9) Whole evidence chain must verify.
      const verify = await engine.verifyEvidence(project.id)
      expect(verify.verified).toBe(true)
      expect(verify.chainLength).toBeGreaterThanOrEqual(5)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
