/** CAE tools: lossless output and automatic ledger citation. */

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from '../src/service.ts'
import { registerCaeTools } from '../src/tools-cae.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

function register(engine: unknown): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerCaeTools(ctx, engine as PmResearchEngine)
  return tools
}

const exec = {
  agent: { session: { header: { agentPreset: 'polymer-modeler' } } },
  signal: new AbortController().signal,
}

describe('CAE tools', () => {
  it('projects undefined summary fields to lossless JSON and cites the run', async () => {
    const recordEvidence = vi.fn(async () => ({ evidence: { id: 'EV-9-test' }, deduped: false }))
    const engine = {
      runCaeCoupon: async () => ({
        result: { status: 'CONVERGED', valid: true, solver: { energy: Number.NaN } },
        summary: { status: 'CONVERGED', valid: true, model: 'coupon', schemaVersion: '1', sourceSha256: undefined, deterministic: true },
        artifactPath: 'C:/pm/artifacts/coupon.json',
      }),
      recordEvidence,
    }
    const tool = register(engine).get('pm_cae_coupon')!
    const result = await tool.execute({
      projectId: 'PR-1-test',
      stretchX: 1.2,
      stretchY: 1.0,
    }, exec) as { ok: boolean; data: { evidence: { id: string } } }
    expect(result.ok).toBe(true)
    expect(result.data.evidence.id).toBe('EV-9-test')
    expect(recordEvidence).toHaveBeenCalledWith('PR-1-test', expect.objectContaining({
      polarity: 'neutral',
      sourceRef: { type: 'run', ref: 'C:/pm/artifacts/coupon.json' },
      recordedBy: 'preset:polymer-modeler',
    }))
    // The tool runtime rejects non-lossless JSON; NaN must already be null.
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('"energy":null')
    expect(serialized).not.toContain('NaN')
  })
})
