/** MD layer availability contract: honest run-or-deny without LAMMPS. */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PmResearchEngine } from '../src/service.ts'
import { registerSimTools } from '../src/tools-sim.ts'

interface RegisteredTool {
  execute(args: unknown, exec: unknown): Promise<unknown>
}

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

describe('pm_sim_md_run availability', () => {
  it('runs a real MD job with LAMMPS or denies honestly with SIM_UNAVAILABLE', { timeout: 180_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-sim-md-'))
    const engine = PmResearchEngine.open(join(dir, 'pm'))
    const project = await engine.createProject({ title: 'MD 可用性', question: 'q', domain: 'generic-polymer' }, 'test')
    const md = register(engine).get('pm_sim_md_run')!
    const result = await md.execute({
      projectId: project.id,
      job: 'equilibrate',
      steps: 1000,
      record: false,
    }, {
      agent: { session: { header: { cwd: dir, agentPreset: 'polymer-modeler' } } },
      signal: new AbortController().signal,
    }) as { ok: boolean; error?: { code: string }; data?: { simulation: Record<string, unknown> } }
    if (result.ok) {
      expect(result.data?.simulation.job).toBe('equilibrate')
    } else {
      expect(result.error?.code).toBe('SIM_UNAVAILABLE')
    }
  })
})
