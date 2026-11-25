import { describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import {
  PM_SURFACE_VERSION,
  buildPmHealthReport,
  createPmHealthHandler,
  registeredTools,
} from '../src/index.ts'

/** Minimal ServerResponse stub capturing what the handler writes. */
class StubResponse {
  readonly headers = new Map<string, string>()
  statusCode = 0
  body = ''
  setHeader(name: string, value: string): void { this.headers.set(name, value) }
  end(payload?: string): void { this.body = payload ?? '' }
}

describe('pm health surface', () => {
  it('reports the serving identity, surface version, and uptime', () => {
    const report = buildPmHealthReport(94_500)
    expect(report).toEqual({
      ok: true,
      service: 'pm-research',
      surfaceVersion: PM_SURFACE_VERSION,
      capabilities: ['/pm/health', '/pm/overview'],
      uptimeSeconds: 95,
      tools: [],
    })
    expect(PM_SURFACE_VERSION).toBe(2)
  })

  it('clamps negative uptime to zero', () => {
    expect(buildPmHealthReport(-5).uptimeSeconds).toBe(0)
  })

  it('reports every registered tool exactly once', () => {
    const tools = registeredTools()
    expect(new Set(tools).size).toBe(tools.length)
    expect(tools).toHaveLength(36)
    expect(tools).toContain('pm_sim_rubber_elasticity')
    expect(tools).toContain('pm_knowledge_review')
    expect(tools).toContain('pm_experiment_plan')
    expect(tools).toContain('pm_waxs_pro')
    expect(tools).toContain('pm_analysis_report')
    expect(tools).toContain('pm_kb_note')
  })

  it('serves JSON with no-store caching and nosniff protection', () => {
    const stub = new StubResponse()
    const handler = createPmHealthHandler(buildPmHealthReport(1_000))
    handler(undefined as never, stub as unknown as ServerResponse)
    expect(stub.statusCode).toBe(200)
    expect(stub.headers.get('cache-control')).toBe('no-store')
    expect(stub.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(stub.headers.get('x-content-type-options')).toBe('nosniff')
    expect(JSON.parse(stub.body)).toMatchObject({ ok: true, service: 'pm-research' })
  })
})
