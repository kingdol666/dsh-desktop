/** PolyMechanism research services: Host plugin exposing domain services, tools, and HTTP routes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only convergence: the webserver package augments `Context.webServer`.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { PmResearchEngine, resolvePmDataRoot, type PmResearchConfig } from './service.ts'
import { registerPmTools } from './tools.ts'
import { registerSkills } from './skills.ts'

/** Version of the pm HTTP surface served under `/pm/*`. Bump on breaking changes. */
export const PM_SURFACE_VERSION = 2 as const

/** Identity and capability report served by `/pm/health`. */
export interface PmHealthReport {
  /** Always true while the route answers. */
  readonly ok: true
  /** Serving plugin identity. */
  readonly service: 'pm-research'
  /** HTTP surface version. */
  readonly surfaceVersion: typeof PM_SURFACE_VERSION
  /** Route paths currently registered by this plugin. */
  readonly capabilities: readonly string[]
  /** Process uptime in seconds when the report was built. */
  readonly uptimeSeconds: number
  /** Tool names registered on the Host tool runtime (empty when `tools` is absent). */
  readonly tools: readonly string[]
}

/** Build the health report served at `/pm/health`. @param uptimeMs - Host process uptime in milliseconds. */
export function buildPmHealthReport(uptimeMs: number): PmHealthReport {
  return {
    ok: true,
    service: 'pm-research',
    surfaceVersion: PM_SURFACE_VERSION,
    capabilities: ['/pm/health', '/pm/overview'],
    uptimeSeconds: Math.max(0, Math.round(uptimeMs / 1000)),
    tools: [],
  }
}

/** Serialize one JSON value with no-store caching and nosniff protection. @param res - target response. */
export function writePmJson(res: ServerResponse, payload: unknown): void {
  res.statusCode = 200
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

/**
 * Create the `/pm/health` route handler. Kept pure over its inputs so tests can
 * drive it without a bound server.
 * @param report - report served for every request.
 * @returns a handler owning the full response lifecycle.
 */
export function createPmHealthHandler(report: PmHealthReport): (req: IncomingMessage, res: ServerResponse) => void {
  return (_req, res) => { writePmJson(res, report) }
}

/**
 * Host services used by the pm entry point. `webServer` is OPTIONAL: the
 * research tools must also activate in headless/CLI harness profiles that
 * mount no HTTP surface — only the /pm routes require it.
 */
export const inject = [] as const

/**
 * Register the PolyMechanism domain routes and tools on the shared carrier.
 * @param ctx - Host Cordis context.
 * @param config - optional plugin config (`dataRoot` overrides `$DSH_HOME/pm`).
 */
export function apply(ctx: Context, config: PmResearchConfig = {}): void {
  const startedAt = Date.now()
  const engine = PmResearchEngine.open(resolvePmDataRoot(config))
  // Routes activate only when a web carrier exists (headless harnesses have no
  // HTTP surface); the tools below never depend on it.
  ctx.inject(['webServer'], (webScope) => {
    const webServer = webScope.webServer
    ctx.effect(
      () => webServer.register({
        kind: 'exact',
        path: '/pm/health',
        handler: (_req, res) => { writePmJson(res, { ...buildPmHealthReport(Date.now() - startedAt), tools: registeredTools() }) },
      }),
      'pm-research: /pm/health route',
    )
    ctx.effect(
      () => webServer.register({
        kind: 'exact',
        path: '/pm/overview',
        handler: (_req, res) => {
          void engine.overview().then(
            overview => { writePmJson(res, { ok: true, data: overview }) },
            cause => {
              res.statusCode = 500
              res.setHeader('cache-control', 'no-store')
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.setHeader('x-content-type-options', 'nosniff')
              res.end(JSON.stringify({
                ok: false,
                error: {
                  code: 'INTERNAL',
                  message: cause instanceof Error ? cause.message : String(cause),
                  hint: 'retry, or check the pm data root and its project ledgers',
                },
              }))
            },
          )
        },
      }),
      'pm-research: /pm/overview route',
    )
    // Read-only workbench surface: the client lists projects and renders one
    // project's ledger, hypotheses, mechanism graph, and knowledge cards.
    ctx.effect(
      () => webServer.register({
        kind: 'prefix',
        path: '/pm/projects',
        handler: (req, res) => {
          const path = (req.url ?? '').split('?')[0] ?? ''
          const stateMatch = /^\/pm\/projects\/([^/]+)\/state$/u.exec(path)
          const produce = async (): Promise<unknown> => {
            if (path === '/pm/projects') {
              return {
                projects: (await engine.listProjects()).map(project => ({
                  id: project.id,
                  title: project.title,
                  status: project.status,
                  domain: project.domain,
                })),
              }
            }
            if (stateMatch !== null) {
              return engine.projectState(decodeURIComponent(stateMatch[1] ?? ''))
            }
            return { error: 'unknown pm route' }
          }
          void produce().then(
            data => { writePmJson(res, { ok: true, data }) },
            cause => {
              res.statusCode = 500
              res.setHeader('cache-control', 'no-store')
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.setHeader('x-content-type-options', 'nosniff')
              res.end(JSON.stringify({
                ok: false,
                error: { code: 'INTERNAL', message: cause instanceof Error ? cause.message : String(cause) },
              }))
            },
          )
        },
      }),
      'pm-research: /pm/projects workbench routes',
    )
  })
  // The live preset registry knows a selection committed after the session
  // header was written; the header is only the session's initial composition.
  // Resolved lazily per call: in a headless boot this plugin can apply before
  // the registry service is provided, and a captured snapshot would stay empty.
  type PresetRegistry = {
    composedPreset(context: Context): string | undefined
    readonly defaultId?: string
  }
  const resolvePreset = (exec: { readonly agent?: unknown }): string | undefined => {
    const agent = exec.agent as { readonly ctx?: Context } | undefined
    if (agent?.ctx === undefined) return undefined
    try {
      const registry = ctx.reflect?.get('agentPresets', false) as PresetRegistry | undefined
      // Headless runners create sessions without a preset header; the profile's
      // configured default is the authority those sessions run under.
      return registry?.composedPreset(agent.ctx) ?? registry?.defaultId
    } catch {
      return undefined
    }
  }
  registerPmTools(ctx, engine, resolvePreset)
  registerSkills(ctx)
}

/** Tools registered by this plugin in the current process (health-report view). */
export function registeredTools(): readonly string[] {
  return [
    'pm_project_create',
    'pm_evidence_record',
    'pm_evidence_query',
    'pm_evidence_verify',
    'pm_hypothesis_propose',
    'pm_hypothesis_transition',
    'pm_mechanism_query',
    'pm_mechanism_propose_edge',
    'pm_mechanism_import_seed',
    'pm_knowledge_query',
    'pm_knowledge_propose',
    'pm_knowledge_review',
    'pm_gate_check',
    'pm_sim_chain_mechanics',
    'pm_sim_rubber_elasticity',
    'pm_sim_viscoelastic',
    'pm_sim_chain_stats',
    'pm_sim_crystallization',
    'pm_sim_flory_huggins',
    'pm_sim_tg_blend',
    'pm_sim_diffusion',
    'pm_sim_md_run',
    'pm_waxs_analyze',
    'pm_ftir_analyze',
    'pm_saxs_analyze',
    'pm_hermans_analyze',
    'pm_model_fit',
    'pm_literature_read',
    'pm_literature_extract',
    'pm_literature_search',
    'pm_literature_screen',
    'pm_literature_download',
  ]
}
