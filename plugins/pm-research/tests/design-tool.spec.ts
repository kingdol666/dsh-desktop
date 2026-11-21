/** pm_experiment_plan: factorial matrix, power/sample size, randomization, permissions. */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { registerDesignTools } from '../src/tools-design.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

function register(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerDesignTools(ctx)
  return tools
}

function execFor(preset: string): unknown {
  return {
    agent: { session: { header: { cwd: process.cwd(), agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

describe('experiment design tool', () => {
  it('computes the full-factorial matrix and n per cell', async () => {
    const tool = register().get('pm_experiment_plan')!
    const result = await tool.execute({
      factors: [
        { name: 'RH', levels: [11, 43, 75, 93], unit: '%' },
        { name: 'anneal', levels: [25, 90, 120, 150], unit: 'C' },
      ],
      response: { name: 'Xc', effectSize: 0.05, sigma: 0.02 },
      alpha: 0.05,
      power: 0.8,
      seed: 7,
    }, execFor('polymer-scientist')) as { ok: boolean; data?: Record<string, unknown> }
    expect(result.ok).toBe(true)
    const data = result.data!
    expect(data.cells).toBe(16)
    const sample = data.sampleSize as { nPerCell: number; recommended: number }
    expect(sample.recommended).toBe(3)
    expect(sample.nPerCell).toBe(3)
    expect(data.totalRuns).toBe(48)
    expect((data.designMatrixPreview as unknown[]).length).toBe(16)
    expect((data.randomization as { orderPreview: unknown[] }).orderPreview.length).toBe(48)
  })

  it('rejects a preset outside the permission matrix', async () => {
    const tool = register().get('pm_experiment_plan')!
    const result = await tool.execute({
      factors: [{ name: 'RH', levels: [11, 93] }],
      response: { name: 'Xc', effectSize: 0.05, sigma: 0.02 },
    }, execFor('polymer-literature')) as { ok: boolean; error?: { code?: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('PERMISSION_DENIED')
  })

  it('rejects an invalid sigma', async () => {
    const tool = register().get('pm_experiment_plan')!
    const result = await tool.execute({
      factors: [{ name: 'RH', levels: [11, 93] }],
      response: { name: 'Xc', effectSize: 0.05, sigma: 0 },
    }, execFor('polymer-scientist')) as { ok: boolean; error?: { code?: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })
})
