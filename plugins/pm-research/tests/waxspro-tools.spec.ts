/** pm_waxs_pro + pm_analysis_report: real Python engine, evidence, reports, permissions. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PmResearchEngine } from '../src/service.ts'
import { registerWaxsProTools } from '../src/tools-waxspro.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-waxspro-tools-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function register(engine: PmResearchEngine): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerWaxsProTools(ctx, engine)
  return tools
}

function execFor(root: string, preset: string): unknown {
  return {
    agent: { session: { header: { cwd: root, agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

describe('waxs pro pipeline tools', () => {
  it('fits bounded crystalline+amorphous peaks and registers evidence', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const project = await engine.createProject(
      { title: 'WAXS pro 验收', question: '结晶度与晶粒尺寸', domain: 'pva-optical-film' },
      'test',
    )
    const dir = join(root, 'data')
    await mkdir(dir, { recursive: true })
    const lines = ['twotheta_deg,intensity']
    for (let i = 0; i < 200; i += 1) {
      const x = 9 + (19 * i) / 199
      const gauss = (area: number, center: number, width: number): number =>
        (area / (width * Math.sqrt(Math.PI / 2))) * Math.exp(-2 * ((x - center) / width) ** 2)
      const value
        = gauss(500, 11.6, 0.5) + gauss(2000, 19.5, 0.7) + gauss(600, 22.9, 0.8) + gauss(2600, 20.3, 3.5) + 30
      lines.push(`${x.toFixed(4)},${value.toFixed(4)}`)
    }
    await writeFile(join(dir, 'pva_fit.csv'), `${lines.join('\n')}\n`, 'utf8')

    const tools = register(engine)
    const pro = tools.get('pm_waxs_pro')
    expect(pro).toBeDefined()
    const result = await pro!.execute({
      projectId: project.id,
      op: 'peakfit',
      dataPath: 'data/pva_fit.csv',
      peaks: [
        { center: 11.6, width: 0.5, role: 'crystalline' },
        { center: 19.5, width: 0.7, role: 'crystalline' },
        { center: 22.9, width: 0.8, role: 'crystalline' },
        { center: 20.3, width: 3.5, role: 'amorphous' },
      ],
      fitRange: [9, 28],
      claimSupport: 'WAXS pro peakfit truth recovery',
      strength: 'moderate',
    }, execFor(root, 'polymer-characterization')) as {
      ok: boolean
      data?: { analysis: { crystallinityIndex: number; peaks: { centerDeg: number; scherrerNm: number | null }[]; fit: { r2: number } }; evidence: { id: string } }
      error?: { code?: string }
    }
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(Math.abs(result.data!.analysis.crystallinityIndex - 0.544)) .toBeLessThan(0.01)
    expect(result.data!.analysis.fit.r2).toBeGreaterThan(0.99)
    expect(result.data!.analysis.peaks.some(peak => Math.abs(peak.centerDeg - 19.5) < 0.05)).toBe(true)
    expect(result.data!.analysis.peaks.every(peak => peak.scherrerNm !== null)).toBe(true)
    expect(result.data!.evidence.id).toMatch(/^EV-/u)
  }, 90_000)

  it('renders an MD+HTML report into the workspace and rejects paths outside it', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const tools = register(engine)
    const report = tools.get('pm_analysis_report')
    expect(report).toBeDefined()

    const result = await report!.execute({
      payload: {
        title: 'PVA 干四 WAXS 拟合讲解',
        subtitle: 'pm_waxs_pro peakfit 演示',
        kpis: [{ label: '结晶度', value: '0.544', unit: '', note: '真值 0.544' }],
        sections: [{
          heading: '处理过程',
          narrative: '8 峰 Gauss 面积拟合，窗口 9-28°，扣线性基线',
          table: { headers: ['峰', '2θ'], rows: [['(101)', '11.6']] },
          figure: {
            xLabel: '2θ (°)',
            yLabel: 'I (a.u.)',
            series: [
              { name: '观测', points: [[9, 30], [19.5, 2000], [28, 40]] },
              { name: '拟合', points: [[9, 32], [19.5, 1960], [28, 42]], dash: true },
            ],
          },
        }],
        conclusions: ['峰位恢复到 0.01° 以内'],
      },
      outputDir: 'reports/waxs-pro',
      name: 'gansi-fit',
    }, execFor(root, 'polymer-characterization')) as {
      ok: boolean
      data?: { htmlPath: string; markdownPath: string }
      error?: { code?: string }
    }
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const html = await readFile(result.data!.htmlPath, 'utf8')
    const markdown = await readFile(result.data!.markdownPath, 'utf8')
    expect(html).toContain('<svg')
    expect(html).toContain('PVA 干四 WAXS 拟合讲解')
    expect(html).toContain('结论')
    expect(markdown).toContain('# PVA 干四 WAXS 拟合讲解')
    expect(result.data!.htmlPath).toContain(join('reports', 'waxs-pro'))

    const outside = await report!.execute({
      payload: { title: 'x', sections: [{ heading: 'h', narrative: 'n' }] },
      outputDir: '../outside',
      name: 'escape',
    }, execFor(root, 'polymer-characterization')) as { ok: boolean; data?: { htmlPath: string } }
    if (outside.ok) {
      expect(outside.data!.htmlPath.startsWith(root)).toBe(true)
    }
  }, 90_000)

  it('denies the reviewer preset the analysis pipeline', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const tools = register(engine)
    const pro = tools.get('pm_waxs_pro')!
    const result = await pro.execute({
      op: 'peakfit',
      dataPath: 'data/pva_fit.csv',
    }, execFor(root, 'polymer-reviewer')) as { ok: boolean; error?: { code?: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('PERMISSION_DENIED')
  })
})
