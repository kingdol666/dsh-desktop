/** PolyMechanism research services: Host plugin exposing domain services, tools, and HTTP routes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only convergence: the webserver package augments `Context.webServer`.
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Version of the pm HTTP surface served under `/pm/*`. Bump on breaking changes. */
export const PM_SURFACE_VERSION = 1 as const

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
}

/** Build the health report served at `/pm/health`. @param uptimeMs - Host process uptime in milliseconds. */
export function buildPmHealthReport(uptimeMs: number): PmHealthReport {
  return {
    ok: true,
    service: 'pm-research',
    surfaceVersion: PM_SURFACE_VERSION,
    capabilities: ['/pm/health'],
    uptimeSeconds: Math.max(0, Math.round(uptimeMs / 1000)),
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

/** Host services required by the pm entry point. */
export const inject = ['webServer'] as const

/**
 * Register the PolyMechanism domain routes on the shared WebServer carrier.
 * @param ctx - Host Cordis context.
 */
export function apply(ctx: Context): void {
  const startedAt = Date.now()
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/pm/health',
      handler: (_req, res) => { writePmJson(res, buildPmHealthReport(Date.now() - startedAt)) },
    }),
    'pm-research: /pm/health route',
  )
}
