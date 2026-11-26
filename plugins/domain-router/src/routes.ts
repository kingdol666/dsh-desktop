/** Authenticated /api/pm-domain/* routes consumed by the Literature page. */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { domainCounts, listDocs, orphanPdfs } from './kb.ts'
import { readProject } from './projects.ts'
import { findDomain, loadRegistry } from './registry.ts'
import { readState, writeState } from './state.ts'
import type { DomainConfig } from './types.ts'
import type { DomainRouterOptions } from './tools.ts'

interface FetchRoute {
  readonly path: string
  readonly methods: ReadonlyArray<'GET' | 'POST'>
  readonly requestBody: 'buffered'
  readonly fetch: (request: Request) => Promise<Response>
}

interface ConnectionLike {
  readonly fetch?: {
    register(route: FetchRoute): () => Promise<void>
  }
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}

function failure(code: string, message: string, status = 400, hint?: string): Response {
  return response({ ok: false, error: { code, message, ...(hint === undefined ? {} : { hint }) } }, status)
}

function domainView(domain: DomainConfig): Record<string, unknown> {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    keywords: domain.keywords,
    kbRoot: domain.kbRoot,
    ...(domain.notesRoot === undefined ? {} : { notesRoot: domain.notesRoot }),
    ...(domain.zoteroCollection === undefined ? {} : { zoteroCollection: domain.zoteroCollection }),
    ...(domain.litProject === undefined ? {} : { litProject: domain.litProject }),
    allowedKinds: domain.allowedKinds,
    defaultKind: domain.defaultKind,
    relatedDomains: domain.relatedDomains,
    priority: domain.priority,
  }
}

function workspaceOf(request: Request): string | undefined {
  const raw = new URL(request.url).searchParams.get('workspace')
  if (raw === null || raw.trim() === '') return undefined
  const workspace = resolve(raw.trim())
  return existsSync(workspace) ? workspace : undefined
}

function queryNumber(url: URL, name: string, fallback: number, max: number): number {
  const value = url.searchParams.get(name)
  if (value === null || value.trim() === '') return fallback
  const raw = Number(value)
  return Number.isFinite(raw) ? Math.max(0, Math.min(max, Math.trunc(raw))) : fallback
}

async function handleDomains(request: Request, options: DomainRouterOptions): Promise<Response> {
  const workspace = workspaceOf(request)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少有效的 workspace 查询参数')
  const registry = await loadRegistry(workspace, options.homeDir)
  const state = await readState(workspace)
  const active = state?.domain ?? registry.defaultDomain ?? null
  const domains = registry.domains.map(domain => ({ ...domainView(domain), counts: domainCounts(domain) }))
  return response({
    ok: true,
    workspace,
    domains,
    activeDomain: active,
    projectId: state?.projectId ?? null,
    warnings: registry.warnings,
  })
}

async function handleActive(request: Request, options: DomainRouterOptions): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return failure('INVALID_BODY', '请求体必须是 JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return failure('INVALID_BODY', '请求体必须是对象')
  const record = body as Record<string, unknown>
  const workspaceRaw = typeof record.workspace === 'string' ? record.workspace.trim() : ''
  const domainId = typeof record.domain === 'string' ? record.domain.trim() : ''
  if (workspaceRaw === '') return failure('WORKSPACE_REQUIRED', '缺少 workspace')
  const workspace = resolve(workspaceRaw)
  if (!existsSync(workspace)) return failure('WORKSPACE_NOT_FOUND', `工作区不存在：${workspace}`)
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain')
  const registry = await loadRegistry(workspace, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) {
    return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404, `可选：${registry.domains.map(item => item.id).join(', ')}`)
  }
  const projectId = typeof record.projectId === 'string' && record.projectId.trim() !== '' ? record.projectId.trim() : undefined
  const project = projectId === undefined ? undefined : await readProject(options.homeDir, projectId)
  if (projectId !== undefined && project === undefined) return failure('PROJECT_NOT_FOUND', `项目不存在：${projectId}`, 404)
  const state = {
    schemaVersion: 1 as const,
    domain: domain.id,
    ...(project === undefined ? {} : { projectId: project.id }),
    updatedAt: new Date().toISOString(),
  }
  await writeState(workspace, state)
  return response({ ok: true, workspace, domain: domainView(domain), project: project ?? null, state })
}

async function handleLiterature(request: Request, options: DomainRouterOptions): Promise<Response> {
  const url = new URL(request.url)
  const workspace = workspaceOf(request)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少有效的 workspace 查询参数')
  const domainId = url.searchParams.get('domain') ?? ''
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain 查询参数')
  const registry = await loadRegistry(workspace, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404)
  const state = await readState(workspace)
  const requestedKind = url.searchParams.get('kind')
  const kind = requestedKind !== null && requestedKind.trim() !== '' ? requestedKind.trim() : domain.defaultKind
  const limit = Math.max(1, Math.min(200, queryNumber(url, 'limit', 100, 200)))
  const offset = queryNumber(url, 'offset', 0, 100000)
  const papers = listDocs(domain.kbRoot, { domain: domain.id, kind, limit, offset })
  const notes = domain.notesRoot === undefined
    ? { docs: [], total: 0, domainColumn: false }
    : listDocs(domain.notesRoot, { domain: domain.id, kind: 'all', limit, offset })
  return response({
    ok: true,
    workspace,
    domain: domainView(domain),
    activeDomain: state?.domain ?? registry.defaultDomain ?? null,
    projectId: state?.projectId ?? null,
    counts: domainCounts(domain),
    papers,
    notes,
    health: {
      domainColumn: papers.domainColumn,
      vectors: domainCounts(domain).vectors,
      note: 'hybrid 失败会回退 keyword；页面显示 vectors 数量供判断。',
    },
  })
}

async function handleOrphans(request: Request, options: DomainRouterOptions): Promise<Response> {
  const url = new URL(request.url)
  const workspace = workspaceOf(request)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少有效的 workspace 查询参数')
  const domainId = url.searchParams.get('domain') ?? ''
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain 查询参数')
  const registry = await loadRegistry(workspace, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404)
  const limit = Math.max(1, Math.min(200, queryNumber(url, 'limit', 100, 200)))
  const paths = await orphanPdfs(workspace, domain, limit)
  return response({ ok: true, workspace, domain: domain.id, total: paths.length, paths })
}

/** Register all routes; returns an async disposer. */
export function registerDomainRoutes(connection: ConnectionLike, options: DomainRouterOptions): () => Promise<void> {
  const register = connection.fetch?.register
  if (typeof register !== 'function') return async () => {}
  const disposers: Array<() => Promise<void>> = []
  const routes: FetchRoute[] = [
    { path: '/api/pm-domain/domains', methods: ['GET'], requestBody: 'buffered', fetch: request => handleDomains(request, options) },
    { path: '/api/pm-domain/active', methods: ['POST'], requestBody: 'buffered', fetch: request => handleActive(request, options) },
    { path: '/api/pm-domain/literature', methods: ['GET'], requestBody: 'buffered', fetch: request => handleLiterature(request, options) },
    { path: '/api/pm-domain/orphans', methods: ['GET'], requestBody: 'buffered', fetch: request => handleOrphans(request, options) },
  ]
  for (const route of routes) disposers.push(register(route))
  return async () => {
    await Promise.all(disposers.map(dispose => dispose()))
  }
}
