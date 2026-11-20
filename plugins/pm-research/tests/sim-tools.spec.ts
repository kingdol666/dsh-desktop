/** Simulation tools: truth-backed analytic runs, evidence archiving, permissions. */

import { mkdir, mkdtemp, writeFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PmResearchEngine } from '../src/service.ts'
import { registerSimTools } from '../src/tools-sim.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-sim-tools-'))
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
  registerSimTools(ctx, engine)
  return tools
}

function execFor(root: string, preset: string): unknown {
  return {
    agent: { session: { header: { cwd: root, agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

async function makeProject(root: string, title: string) {
  const engine = PmResearchEngine.open(join(root, 'pm'))
  const project = await engine.createProject({ title, question: 'q', domain: 'pva-optical-film' }, 'test')
  return { engine, project }
}

describe('polymer simulation tools', () => {
  it('predicts affine orientation, archives the artifact, and cites simulation evidence', async () => {
    const root = await tempRoot()
    const { engine, project } = await makeProject(root, '取向预测')
    const stats = register(engine).get('pm_sim_chain_stats')!
    const result = await stats.execute({
      projectId: project.id,
      beadsPerChain: 100,
      kuhnLengthNm: 1.0,
      stretchX: 2.0,
    }, execFor(root, 'polymer-physicist')) as {
      ok: boolean
      data?: { simulation: { orientation: { orientationF: number } }; evidence: { id: string }; artifactPath: string }
    }
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(result.data?.simulation.orientation.orientationF).toBeCloseTo(0.7, 6)
    expect(result.data?.evidence.id).toMatch(/^EV-/u)
    const ledger = await engine.queryEvidence(project.id)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.payload).toMatchObject({ simulation: 'pm_sim_chain_stats' })
    await expect(access(result.data!.artifactPath)).resolves.toBeUndefined()
  }, 60_000)

  it('denies a preset outside the matrix', async () => {
    const root = await tempRoot()
    const { engine, project } = await makeProject(root, '权限')
    const rubber = register(engine).get('pm_sim_rubber_elasticity')!
    const result = await rubber.execute({
      projectId: project.id,
      mode: 'uniaxial',
      shearModulusMPa: 1.0,
      linksPerChain: 200,
    }, execFor(root, 'polymer-characterization')) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('PERMISSION_DENIED')
  })

  it('fits Avrami kinetics from a workspace CSV near the injected truth', async () => {
    const root = await tempRoot()
    const { engine, project } = await makeProject(root, '结晶动力学')
    const dir = join(root, 'data')
    await mkdir(dir, { recursive: true })
    const lines = ['time_s,crystallinity']
    for (let i = 0; i < 60; i += 1) {
      const t = 5 + (95 * i) / 59
      const x = 1 - Math.exp(-0.001 * t ** 3)
      lines.push(`${t.toFixed(4)},${x.toFixed(6)}`)
    }
    await writeFile(join(dir, 'avrami.csv'), `${lines.join('\n')}\n`, 'utf8')
    const avrami = register(engine).get('pm_sim_crystallization')!
    const result = await avrami.execute({
      projectId: project.id,
      dataPath: 'data/avrami.csv',
    }, execFor(root, 'polymer-modeler')) as {
      ok: boolean
      data?: { simulation: { n: number; K: number; fit: { r2: number } }; evidence: { id: string } }
    }
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(Math.abs(result.data!.simulation.n - 3)).toBeLessThan(0.02)
    expect(Math.abs(result.data!.simulation.K - 0.001) / 0.001).toBeLessThan(0.05)
    expect(result.data!.simulation.fit.r2).toBeGreaterThan(0.99)
  }, 60_000)

  it('returns a Flory–Huggins verdict and skips recording when asked', async () => {
    const root = await tempRoot()
    const { engine, project } = await makeProject(root, '相容性')
    const flory = register(engine).get('pm_sim_flory_huggins')!
    const result = await flory.execute({
      projectId: project.id,
      n1: 100,
      n2: 100,
      chi: 0.01,
      phi: 0.5,
      record: false,
    }, execFor(root, 'polymer-scientist')) as {
      ok: boolean
      data?: { simulation: { verdict: string }; evidence: unknown }
    }
    expect(result.ok).toBe(true)
    expect(result.data?.simulation.verdict).toBe('STABLE_SINGLE_PHASE')
    expect(result.data?.evidence).toBeNull()
    expect(await engine.queryEvidence(project.id)).toHaveLength(0)
  }, 60_000)

  it('rejects an incomplete shift request with INVALID_ARGUMENT', async () => {
    const root = await tempRoot()
    const { engine, project } = await makeProject(root, '参数校验')
    const visco = register(engine).get('pm_sim_viscoelastic')!
    const result = await visco.execute({
      projectId: project.id,
      part: 'shift',
      referenceTemperatureK: 350,
    }, execFor(root, 'polymer-physicist')) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })
})
