/** CAE tools: whole-machine run and coupon through the real engine. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from './service.ts'
import { canUseTool } from './permissions.ts'

/** Envelope cast for the tool JSON frontier (same contract as tools.ts). */
function toToolJson(value: unknown): Record<string, never> {
  return value as never
}

function deny(tool: string, preset: string | undefined): Record<string, never> | undefined {
  if (canUseTool(tool, preset)) return undefined
  return toToolJson({
    ok: false,
    error: {
      code: 'PERMISSION_DENIED',
      message: `preset ${preset ?? '(unattributed)'} is not allowed to call ${tool}`,
      hint: 'allowed presets: docs/polymechanism/09-API与工具契约.md §6',
    },
  })
}

function render(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/**
 * Register CAE tools.
 * @param ctx - Host context providing the tools service.
 * @param engine - research engine facade (requires caeRoot configured).
 */
export function registerCaeTools(ctx: Context, engine: PmResearchEngine): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_cae_coupon',
      description: '真实引擎 affine 验证 coupon（秒级）：判别扫描与健康检查',
      parameters: {
        projectId: { type: 'string', required: true },
        stretchX: { type: 'number', required: true },
        stretchY: { type: 'number', required: true },
        mesh: { type: 'string' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args) {
        const blocked = deny('pm_cae_coupon', args.preset)
        if (blocked !== undefined) return toToolJson(blocked)
        try {
          const run = await engine.runCaeCoupon(args.projectId, { stretchX: args.stretchX, stretchY: args.stretchY, ...(args.mesh === undefined ? {} : { mesh: args.mesh }) })
          return toToolJson({ ok: true, data: run })
        } catch (cause) {
          return toToolJson({
            ok: false,
            error: { code: 'CAE_UNAVAILABLE', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_cae_run',
      description: '真实引擎全流程求解（产物 metrics + provenance 哈希，证据归档）',
      parameters: {
        projectId: { type: 'string', required: true },
        params: { type: 'object', additionalProperties: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args) {
        const blocked = deny('pm_cae_run', args.preset)
        if (blocked !== undefined) return toToolJson(blocked)
        try {
          const run = await engine.runCaeRun(args.projectId, args.params)
          return toToolJson({ ok: true, data: run })
        } catch (cause) {
          return toToolJson({
            ok: false,
            error: { code: 'CAE_UNAVAILABLE', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))
  })
}
