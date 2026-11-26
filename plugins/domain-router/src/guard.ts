/** Deny raw cognition tools for expert presets; experts must use domain_* wrappers. */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolGuard } from '@deepseek-ai/dsh-tools'
import type { DomainRouterOptions } from './tools.ts'

interface GuardAgent {
  readonly ctx?: Context
  readonly session?: { readonly header?: { readonly agentPreset?: string } }
}

interface PresetRegistry {
  composedPreset(context: Context): string | undefined
}

function resolvePreset(ctx: Context, execution: { readonly agent?: unknown }): string | undefined {
  const agent = execution.agent as GuardAgent | undefined
  if (agent?.ctx !== undefined) {
    try {
      const registry = ctx.reflect?.get('agentPresets', false) as PresetRegistry | undefined
      if (registry !== undefined) return registry.composedPreset(agent.ctx)
    } catch {
      // Fall back to the session header when the registry is unavailable.
    }
  }
  return agent?.session?.header?.agentPreset
}

/** Register one global guard for raw cognition tools. */
export function registerDomainGuard(ctx: Context, options: DomainRouterOptions): void {
  ctx.inject(['tools'], scope => {
    const guard: ToolGuard = (execution) => {
      if (execution.name !== 'cognition_remember' && execution.name !== 'cognition_recall') return undefined
      const preset = resolvePreset(ctx, execution)
      if (preset === undefined || !options.expertPresets.has(preset)) return undefined
      return `${execution.name} 对专家 preset 已禁用；请使用 domain_remember / domain_recall（领域作用域 + 项目标签）。`
    }
    const dispose = scope.tools.guard(guard)
    scope.effect(() => dispose)
  })
}
