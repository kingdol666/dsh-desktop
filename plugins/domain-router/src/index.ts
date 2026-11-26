/** dsh-domain-router: workspace/global domain registry, routing, active state, and literature data routes. */

import type { Context } from '@deepseek-ai/cordis'
import { registerDomainGuard } from './guard.ts'
import { registerDomainRoutes } from './routes.ts'
import { resolveHomeDir } from './registry.ts'
import { DEFAULT_EXPERT_PRESETS, registerDomainTools, type DomainRouterOptions } from './tools.ts'

/** Plugin identity. */
export const name = 'dsh-domain-router'

/** Optional plugin config. */
export interface DomainRouterConfig {
  /** Override DSH_HOME for tests or embedded profiles. */
  readonly homeDir?: string
  /** Extra expert presets whose raw cognition tools must be blocked. */
  readonly expertPresets?: readonly string[]
}

/** No hard Host service dependency; tools/routes activate through optional injections. */
export const inject = [] as const

/** Register tools, the raw-cognition guard, and the authenticated literature routes. */
export function apply(ctx: Context, config: DomainRouterConfig = {}): void {
  const options: DomainRouterOptions = {
    homeDir: resolveHomeDir(config.homeDir),
    expertPresets: new Set([...DEFAULT_EXPERT_PRESETS, ...(config.expertPresets ?? [])]),
  }
  registerDomainTools(ctx, options)
  registerDomainGuard(ctx, options)
  ctx.inject(['connection'], scope => {
    const connection = (scope as unknown as { connection: Parameters<typeof registerDomainRoutes>[0] }).connection
    const dispose = registerDomainRoutes(connection, options)
    ctx.effect(() => dispose)
  })
}
