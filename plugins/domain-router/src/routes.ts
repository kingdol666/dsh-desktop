/** Authenticated /api/pm-domain/* routes consumed by the Literature page. */

import { domainCounts, domainSchemaState, listDocs, orphanPdfs } from './kb.ts'
import { readProjectForDomain } from './projects.ts'
import { findDomain, loadRegistry } from './registry.ts'
import { readState, writeState } from './state.ts'
import type { DomainConfig } from './types.ts'
import type { DomainRouterOptions } from './tools.ts'
import { isContainedWorkspacePath, relativeWorkspacePath, resolveRegisteredWorkspace, type RegisteredWorkspace } from './workspace.ts'

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

function domainView(domain: DomainConfig, workspace: string): Record<string, unknown> {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    keywords: domain.keywords,
    kbRoot: relativeWorkspacePath(workspace, domain.kbRoot) ?? '.',
    ...(domain.notesRoot === undefined ? {} : { notesRoot: relativeWorkspacePath(workspace, domain.notesRoot) ?? '.' }),
    ...(domain.zoteroCollection === undefined ? {} : { zoteroCollection: domain.zoteroCollection }),
    ...(domain.litProject === undefined ? {} : { litProject: domain.litProject }),
    allowedKinds: domain.allowedKinds,
    defaultKind: domain.defaultKind,
    relatedDomains: domain.relatedDomains,
    priority: domain.priority,
  }
}

async function workspaceOf(request: Request, options: DomainRouterOptions): Promise<RegisteredWorkspace | undefined> {
  const raw = new URL(request.url).searchParams.get('workspace')
  return await resolveRegisteredWorkspace(options.workspaceRegistry, raw)
}

function queryNumber(url: URL, name: string, fallback: number, max: number): number {
  const value = url.searchParams.get(name)
  if (value === null || value.trim() === '') return fallback
  const raw = Number(value)
  return Number.isFinite(raw) ? Math.max(0, Math.min(max, Math.trunc(raw))) : fallback
}

async function handleDomains(request: Request, options: DomainRouterOptions): Promise<Response> {
  const workspace = await workspaceOf(request, options)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少已注册的 workspace')
  const registry = await loadRegistry(workspace.path, options.homeDir)
  const state = await readState(workspace.path)
  const active = state?.domain ?? registry.defaultDomain ?? null
  const domains = registry.domains.map(domain => ({ ...domainView(domain, workspace.path), counts: domainCounts(domain) }))
  return response({
    ok: true,
    workspace: workspace.id,
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
  const workspace = await resolveRegisteredWorkspace(options.workspaceRegistry, workspaceRaw)
  if (workspace === undefined) return failure('WORKSPACE_NOT_FOUND', '工作区未注册或路径不可用', 404)
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain')
  const registry = await loadRegistry(workspace.path, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) {
    return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404, `可选：${registry.domains.map(item => item.id).join(', ')}`)
  }
  const projectId = typeof record.projectId === 'string' && record.projectId.trim() !== '' ? record.projectId.trim() : undefined
  const project = projectId === undefined ? undefined : await readProjectForDomain(options.homeDir, projectId, domain.id)
  if (projectId !== undefined && project === undefined) {
    return failure('PROJECT_DOMAIN_MISMATCH', `项目不存在或不属于领域 ${domain.id}：${projectId}`, 404)
  }
  const state = {
    schemaVersion: 1 as const,
    domain: domain.id,
    ...(project === undefined ? {} : { projectId: project.id }),
    updatedAt: new Date().toISOString(),
  }
  try {
    await writeState(workspace.path, state)
  } catch {
    return failure('STATE_WRITE_FAILED', '无法保存当前工作区的领域状态', 500)
  }
  return response({ ok: true, workspace: workspace.id, domain: domainView(domain, workspace.path), project: project ?? null, state })
}

async function handleLiterature(request: Request, options: DomainRouterOptions): Promise<Response> {
  const url = new URL(request.url)
  const workspace = await workspaceOf(request, options)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少已注册的 workspace')
  const domainId = url.searchParams.get('domain') ?? ''
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain 查询参数')
  const registry = await loadRegistry(workspace.path, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404)
  const state = await readState(workspace.path)
  const requestedKind = url.searchParams.get('kind')?.trim() ?? ''
  const kind = requestedKind === '' ? domain.defaultKind : requestedKind
  const allowedKinds = domain.allowedKinds.filter(value => value !== 'all')
  if (kind !== 'all' && !allowedKinds.includes(kind)) {
    return failure('KIND_NOT_ALLOWED', `领域 ${domain.id} 不允许读取 kind=${kind}`, 400, `可选：${allowedKinds.join(', ')}`)
  }
  const paperKinds = kind === 'all' ? allowedKinds : undefined
  const configuredNoteKinds = allowedKinds.filter(value => value !== 'pdf')
  // Migrated registries keep the papers allowlist at ['pdf']; their separate
  // notes KB still holds reports and text notes.
  const noteKinds = configuredNoteKinds.length === 0 ? ['md', 'markdown', 'txt'] : configuredNoteKinds
  const limit = Math.max(1, Math.min(200, queryNumber(url, 'limit', 100, 200)))
  const offset = queryNumber(url, 'offset', 0, 100000)
  if (domainSchemaState(domain.kbRoot) === 'legacy') {
    return failure('DOMAIN_SCHEMA_REQUIRED', '论文知识库缺少 docs.domain；请完成 schema v5 迁移后再按领域读取。', 409)
  }
  if (domain.notesRoot !== undefined && domainSchemaState(domain.notesRoot) === 'legacy') {
    return failure('DOMAIN_SCHEMA_REQUIRED', '手记知识库缺少 docs.domain；请完成 schema v5 迁移后再按领域读取。', 409)
  }
  const paperPage = listDocs(domain.kbRoot, {
    domain: domain.id,
    ...(paperKinds === undefined ? { kind } : { kinds: paperKinds }),
    limit,
    offset,
  })
  const notePage = domain.notesRoot === undefined
    ? { docs: [], total: 0, domainColumn: true }
    : listDocs(domain.notesRoot, { domain: domain.id, kinds: noteKinds, limit, offset })
  const safePage = async (page: typeof paperPage) => {
    const docs = await Promise.all(page.docs.map(async doc => {
      const path = relativeWorkspacePath(workspace.path, doc.path)
      return path === undefined || path === '.' || !await isContainedWorkspacePath(workspace.path, doc.path)
        ? undefined : { ...doc, path }
    }))
    return { ...page, docs: docs.filter(doc => doc !== undefined) }
  }
  const [papers, notes] = await Promise.all([safePage(paperPage), safePage(notePage)])
  const counts = domainCounts(domain)
  return response({
    ok: true,
    workspace: workspace.id,
    domain: domainView(domain, workspace.path),
    activeDomain: state?.domain ?? registry.defaultDomain ?? null,
    projectId: state?.projectId ?? null,
    counts,
    papers,
    notes,
    health: {
      domainColumn: paperPage.domainColumn,
      vectors: counts.vectors,
      note: 'hybrid 失败会回退 keyword；页面显示 vectors 数量供判断。',
    },
  })
}

async function handleOrphans(request: Request, options: DomainRouterOptions): Promise<Response> {
  const url = new URL(request.url)
  const workspace = await workspaceOf(request, options)
  if (workspace === undefined) return failure('WORKSPACE_REQUIRED', '缺少已注册的 workspace')
  const domainId = url.searchParams.get('domain') ?? ''
  if (domainId === '') return failure('DOMAIN_REQUIRED', '缺少 domain 查询参数')
  const registry = await loadRegistry(workspace.path, options.homeDir)
  const domain = findDomain(registry, domainId)
  if (domain === undefined) return failure('DOMAIN_NOT_FOUND', `领域不存在：${domainId}`, 404)
  const limit = Math.max(1, Math.min(200, queryNumber(url, 'limit', 100, 200)))
  const paths = await orphanPdfs(workspace.path, domain, limit)
  const safePaths = paths.flatMap(item => {
    const path = relativeWorkspacePath(workspace.path, item.path)
    return path === undefined ? [] : [{ ...item, path }]
  })
  return response({ ok: true, workspace: workspace.id, domain: domain.id, total: safePaths.length, paths: safePaths })
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
