/** Domain registry/routing/memory tools registered on the Host tool runtime. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { routeDomains } from './classifier.ts'
import { readProject } from './projects.ts'
import { findDomain, loadRegistry } from './registry.ts'
import { readState, workspaceId, writeState } from './state.ts'
import type { DomainConfig, DomainRegistry, DomainState } from './types.ts'

/** Default expert presets whose raw cognition tools are hidden by the guard. */
export const DEFAULT_EXPERT_PRESETS: readonly string[] = Object.freeze([
  'polymer-physicist',
  'polymer-characterization',
  'polymer-modeler',
  'polymer-literature',
  'polymer-reviewer',
])

/** Options shared by tools, routes, and the guard. */
export interface DomainRouterOptions {
  readonly homeDir: string
  readonly expertPresets: ReadonlySet<string>
}

interface ExecAgent {
  readonly session?: { readonly header?: { readonly cwd?: string; readonly agentPreset?: string } }
}

function execWorkspace(exec: ToolRunContext): string {
  const agent = exec.agent as ExecAgent | undefined
  const cwd = agent?.session?.header?.cwd
  return cwd !== undefined && cwd.trim() !== '' ? cwd : process.cwd()
}

type JsonObject = Record<string, JsonValue>

function json(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function error(code: string, message: string, hint?: string): JsonObject {
  return { ok: false, error: { code, message, ...(hint === undefined ? {} : { hint }) } }
}

function parseToolResult(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { value: parsed }
    } catch {
      return { text: value }
    }
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value }
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

async function contextFor(exec: ToolRunContext, options: DomainRouterOptions): Promise<{
  workspace: string
  registry: DomainRegistry
  state: DomainState | undefined
}> {
  const workspace = execWorkspace(exec)
  const registry = await loadRegistry(workspace, options.homeDir)
  const state = await readState(workspace)
  return { workspace, registry, state }
}

function activeDomain(registry: DomainRegistry, state: DomainState | undefined): DomainConfig | undefined {
  if (state !== undefined) {
    const found = findDomain(registry, state.domain)
    if (found !== undefined) return found
  }
  return registry.defaultDomain === undefined ? undefined : findDomain(registry, registry.defaultDomain)
}

const renderJson = (_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> => [
  { type: 'text', text: JSON.stringify(value) },
]

/** Register the five domain tools. */
export function registerDomainTools(ctx: Context, options: DomainRouterOptions): void {
  ctx.inject(['tools'], scope => {
    const tools = scope.tools

    scope.tools.register(defineTool({
      name: 'domain_list',
      description: '列出当前工作区 + 全局回退的领域注册表，以及 active domain。用于选择领域或排查注册表。',
      parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(_args, exec) {
        const { workspace, registry, state } = await contextFor(exec, options)
        const active = activeDomain(registry, state)
        return json({
          ok: true,
          workspace,
          domains: registry.domains.map(domainView),
          activeDomain: active?.id ?? null,
          projectId: state?.projectId ?? null,
          warnings: registry.warnings,
        })
      },
    }))

    scope.tools.register(defineTool({
      name: 'domain_route',
      description: '根据问题判断领域。纯本地关键词打分，返回 confidence/evidence/alternatives；低置信度只返回一个确认问题，不自动建域。',
      parameters: {
        question: { type: 'string', required: true, description: '用户问题或任务描述。' },
        projectId: { type: 'string', description: '可选 PM 项目 id，用于校验项目是否存在。' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args, exec) {
        const { workspace, registry } = await contextFor(exec, options)
        const project = args.projectId === undefined ? undefined : await readProject(options.homeDir, args.projectId)
        if (args.projectId !== undefined && project === undefined) {
          return error('PROJECT_NOT_FOUND', `项目不存在：${args.projectId}`, '先 pm_project_create，或去掉 projectId')
        }
        const routed = routeDomains(args.question, registry.domains)
        return json({
          ...routed,
          workspace,
          ...(project === undefined ? {} : { project }),
          warnings: registry.warnings,
        })
      },
    }))

    scope.tools.register(defineTool({
      name: 'domain_scope',
      description: '设置当前工作区的 active domain（可绑定 PM 项目）。后续 kb_search/kb_rag/domain_* 默认使用它。',
      parameters: {
        domain: { type: 'string', required: true, description: 'domain id，来自 domain_list。' },
        projectId: { type: 'string', description: '可选 PM 项目 id。' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args, exec) {
        const { workspace, registry } = await contextFor(exec, options)
        const domain = findDomain(registry, args.domain)
        if (domain === undefined) {
          return error('DOMAIN_NOT_FOUND', `领域不存在：${args.domain}`, `可选：${registry.domains.map(item => item.id).join(', ')}`)
        }
        const project = args.projectId === undefined ? undefined : await readProject(options.homeDir, args.projectId)
        if (args.projectId !== undefined && project === undefined) {
          return error('PROJECT_NOT_FOUND', `项目不存在：${args.projectId}`)
        }
        const state: DomainState = {
          schemaVersion: 1,
          domain: domain.id,
          ...(project === undefined ? {} : { projectId: project.id }),
          updatedAt: new Date().toISOString(),
        }
        await writeState(workspace, state)
        return json({ ok: true, workspace, domain: domainView(domain), project: project ?? null, state })
      },
    }))

    scope.tools.register(defineTool({
      name: 'domain_remember',
      description: '写入领域经验记忆：强制 scope=workspace + project/domain 标签。只写可复用规则，不写一次性数值；记忆不是证据。',
      parameters: {
        text: { type: 'string', required: true, description: '规则/经验原文。' },
        subject: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'number' },
        kind: { type: 'string', enum: ['fact', 'correction'] },
        projectId: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args, exec) {
        const { workspace, registry, state } = await contextFor(exec, options)
        const domain = activeDomain(registry, state)
        if (domain === undefined) {
          return error('DOMAIN_REQUIRED', '没有 active domain；先 domain_route + domain_scope')
        }
        const projectId = args.projectId ?? state?.projectId
        if (projectId === undefined) {
          return error('PROJECT_REQUIRED', '领域记忆必须绑定 PM 项目；先 domain_scope(projectId=...)')
        }
        const project = await readProject(options.homeDir, projectId)
        if (project === undefined) return error('PROJECT_NOT_FOUND', `项目不存在：${projectId}`)
        const remember = tools.get('cognition_remember')
        if (remember === undefined) return error('UNAVAILABLE', 'cognition_remember 未注册')
        const callerTags = Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : []
        const tags = [
          `project:${projectId}`,
          `domain:${domain.id}`,
          `workspace:${workspaceId(workspace)}`,
          ...callerTags.filter(tag => !/^(project|domain|workspace):/u.test(tag)),
        ]
        const result = parseToolResult(await remember.execute({
          text: args.text,
          ...(args.subject === undefined ? {} : { subject: args.subject }),
          tags,
          ...(args.importance === undefined ? {} : { importance: args.importance }),
          ...(args.kind === undefined ? {} : { kind: args.kind }),
          scope: 'workspace',
          workspaceId: workspaceId(workspace),
        }, exec))
        return json({ ok: true, workspace, domain: domain.id, projectId, result })
      },
    }))

    scope.tools.register(defineTool({
      name: 'domain_recall',
      description: '召回领域经验记忆：默认同域同项目；跨域需 confirmCrossDomain=true，只展开相关域并标注 domain。',
      parameters: {
        query: { type: 'string', required: true, description: '检索语句。' },
        mode: { type: 'string', enum: ['strict', 'historical', 'belief', 'associative'] },
        limit: { type: 'integer' },
        projectId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        crossDomain: { type: 'boolean' },
        confirmCrossDomain: { type: 'boolean' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args, exec) {
        const { workspace, registry, state } = await contextFor(exec, options)
        const domain = activeDomain(registry, state)
        if (domain === undefined) return error('DOMAIN_REQUIRED', '没有 active domain；先 domain_route + domain_scope')
        const projectId = args.projectId ?? state?.projectId
        const callerTags = Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : []
        const domains = args.crossDomain === true
          ? [domain.id, ...domain.relatedDomains]
          : [domain.id]
        if (args.crossDomain === true && args.confirmCrossDomain !== true) {
          return json({
            ok: false,
            error: {
              code: 'CROSS_DOMAIN_CONFIRMATION_REQUIRED',
              message: '跨域召回需要显式确认；确认后传 confirmCrossDomain=true。',
              domains,
            },
          })
        }
        const recall = tools.get('cognition_recall')
        if (recall === undefined) return error('UNAVAILABLE', 'cognition_recall 未注册')
        const merged: Array<Record<string, unknown>> = []
        for (const id of domains) {
          const tags = [
            ...(projectId === undefined ? [] : [`project:${projectId}`]),
            `domain:${id}`,
            `workspace:${workspaceId(workspace)}`,
            ...callerTags.filter(tag => !/^(project|domain|workspace):/u.test(tag)),
          ]
          const result = parseToolResult(await recall.execute({
            query: args.query,
            ...(args.mode === undefined ? {} : { mode: args.mode }),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
            tags,
            scope: 'workspace',
            workspaceId: workspaceId(workspace),
          }, exec))
          const hits = Array.isArray(result.hits) ? result.hits : []
          for (const hit of hits) {
            merged.push({ ...(typeof hit === 'object' && hit !== null ? hit as Record<string, unknown> : { value: hit }), domain: id })
          }
        }
        const limit = Math.max(1, Math.min(50, args.limit ?? 10))
        return json({
          ok: true,
          workspace,
          domain: domain.id,
          projectId: projectId ?? null,
          crossDomain: args.crossDomain === true,
          domains,
          hits: merged.slice(0, limit),
        })
      },
    }))
  })
}
