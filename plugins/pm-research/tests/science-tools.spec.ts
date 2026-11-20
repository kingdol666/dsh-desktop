/** Science tools: real Python analysis, evidence citation, permissions, path safety. */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PmResearchEngine } from '../src/service.ts'
import { registerScienceTools } from '../src/tools-science.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-science-tools-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function register(engine: PmResearchEngine): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerScienceTools(ctx, engine)
  return tools
}

function execFor(root: string, preset: string): unknown {
  return {
    agent: { session: { header: { cwd: root, agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

async function writeWaxs(root: string): Promise<string> {
  const dir = join(root, 'data')
  await mkdir(dir, { recursive: true })
  const lines = ['two_theta_deg,intensity']
  for (let i = 0; i < 160; i += 1) {
    const x = 10 + (25 * i) / 159
    const halo = 100 * Math.exp(-((x - 20) ** 2) / (4 * 25))
    const peak = 60 * Math.exp(-((x - 22.5) ** 2) / 4)
    lines.push(`${x.toFixed(4)},${(halo + peak).toFixed(4)}`)
  }
  const path = join(dir, 'waxs.csv')
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
  return path
}

describe('science tools', () => {
  it('runs the real WAXS engine, archives the result, and cites evidence', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const project = await engine.createProject({ title: 'PVA 验收', question: '取向与结晶', domain: 'pva-optical-film' }, 'test')
    await writeWaxs(root)
    const tools = register(engine)
    const waxs = tools.get('pm_waxs_analyze')
    expect(waxs).toBeDefined()

    const result = await waxs!.execute({
      projectId: project.id,
      dataPath: 'data/waxs.csv',
    }, execFor(root, 'polymer-characterization')) as {
      ok: boolean
      data?: { analysis: { crystallinityIndex: number; peaks: { center2Theta: number }[] }; evidence: { id: string }; artifactPath: string }
    }
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(result.data?.analysis.crystallinityIndex).toBeGreaterThan(0.05)
    expect(result.data?.analysis.crystallinityIndex).toBeLessThan(0.25)
    expect(result.data?.analysis.peaks.some(peak => Math.abs(peak.center2Theta - 22.5) < 0.2)).toBe(true)
    expect(result.data?.evidence.id).toMatch(/^EV-/u)
    const ledger = await engine.queryEvidence(project.id)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.payload).toMatchObject({ analysis: 'pm_waxs_analyze' })
    const { access } = await import('node:fs/promises')
    await expect(access(result.data!.artifactPath)).resolves.toBeUndefined()
  }, 60_000)

  it('uses the committed session preset over the model-supplied hint', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const project = await engine.createProject({ title: 't', question: 'q', domain: 'generic-polymer' }, 'test')
    await writeWaxs(root)
    const waxs = register(engine).get('pm_waxs_analyze')!
    const result = await waxs.execute({
      projectId: project.id,
      dataPath: 'data/waxs.csv',
      preset: 'polymer-characterization',
    }, execFor(root, 'polymer-physicist')) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('PERMISSION_DENIED')
  })

  it('rejects data paths outside the session workspace', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const project = await engine.createProject({ title: 't', question: 'q', domain: 'generic-polymer' }, 'test')
    const waxs = register(engine).get('pm_waxs_analyze')!
    const result = await waxs.execute({
      projectId: project.id,
      dataPath: '../../secret.csv',
    }, execFor(root, 'polymer-characterization')) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('DATA_OUTSIDE_WORKSPACE')
  })

  it('reads a workspace text source and records literature claims', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(join(root, 'pm'))
    const project = await engine.createProject({ title: '文献验收', question: '取向', domain: 'pva-optical-film' }, 'test')
    await writeFile(join(root, 'paper.txt'), 'Stretching increases PVA birefringence and orientation.\n', 'utf8')
    const tools = register(engine)
    const read = await tools.get('pm_literature_read')!.execute({
      path: 'paper.txt',
    }, execFor(root, 'polymer-literature')) as { ok: boolean; data?: { text: string } }
    expect(read.ok).toBe(true)
    expect(read.data?.text).toContain('birefringence')

    const extracted = await tools.get('pm_literature_extract')!.execute({
      projectId: project.id,
      sourceType: 'doi',
      sourceRef: '10.1000/acceptance',
      title: 'Acceptance paper',
      claims: [
        { claim: 'Draw ratio raises orientation', polarity: 'supports', strength: 'moderate' },
        { claim: 'PVP compensates PVA birefringence', polarity: 'neutral', strength: 'weak' },
      ],
    }, execFor(root, 'polymer-literature')) as { ok: boolean; data?: { recorded: unknown[] } }
    expect(extracted.ok).toBe(true)
    expect(extracted.data?.recorded).toHaveLength(2)
    expect(await engine.queryEvidence(project.id)).toHaveLength(2)
  })
})
