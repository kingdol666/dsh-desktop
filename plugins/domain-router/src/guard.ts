/** Deny raw cognition tools for expert presets; experts must use domain_* wrappers. */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolGuard } from '@deepseek-ai/dsh-tools'
import type { DomainRouterOptions } from './tools.ts'

interface GuardAgent {
  readonly session?: { readonly header?: { readonly agentPreset?: string } }
}

/** Register one global guard for raw cognition tools. */
export function registerDomainGuard(ctx: Context, options: DomainRouterOptions): void {
  ctx.inject(['tools'], scope => {
    const guard: ToolGuard = (execution) => {
      if (execution.name !== 'cognition_remember' && execution.name !== 'cognition_recall') return undefined
      const agent = execution.agent as GuardAgent | undefined
      const preset = agent?.session?.header?.agentPreset
      if (preset === undefined || !options.expertPresets.has(preset)) return undefined
      return `${execution.name} 对专家 preset 已禁用；请使用 domain_remember / domain_recall（领域作用域 + 项目标签）。`
    }
    const dispose = scope.tools.guard(guard)
    ctx.effect(() => dispose)
  })
}
