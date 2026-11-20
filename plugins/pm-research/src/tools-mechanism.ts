/** Mechanism + knowledge + gate tools: split from tools.ts to keep each module focused. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from './service.ts'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson } from './tool-json.ts'

/** Resolved identity or denial envelope. */
type Auth =
  | { readonly ok: true; readonly preset: string; readonly actor: string }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly hint?: string } }

function deny(tool: string, args: { preset?: string; actor?: string }, exec: ToolRunContext, resolve?: PresetResolver): Auth {
  const preset = actingPreset(args, exec, resolve)
  if (preset !== undefined && canUseTool(tool, preset)) {
    return { ok: true, preset, actor: args.actor ?? `preset:${preset}` }
  }
  return {
    ok: false,
    error: {
      code: 'PERMISSION_DENIED',
      message: `preset ${preset ?? '(unattributed)'} is not allowed to call ${tool}`,
      hint: 'allowed presets: docs/polymechanism/09-API与工具契约.md §6',
    },
  }
}

/**
 * Register mechanism/knowledge/gate tools.
 * @param ctx - Host context providing the tools service.
 * @param engine - research engine facade.
 */
export function registerMechanismTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_mechanism_import_seed',
      description: '导入种子机理图谱（PVA 斜拉场景候选物理关系库）',
      parameters: {
        projectId: { type: 'string', required: true },
        seedPath: { type: 'string', required: true },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_mechanism_import_seed', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          return toToolJson({ ok: true, data: await engine.importSeed(args.projectId, args.seedPath) })
        } catch (cause) {
          return toToolJson({
            ok: false,
            error: { code: 'INVALID_ARGUMENT', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_mechanism_query',
      description: '查询机理图谱：锚点扩展 + 工况条件过滤 + 缺失知识提示',
      parameters: {
        projectId: { type: 'string', required: true },
        anchors: { type: 'array', items: { type: 'string' }, required: true },
        hops: { type: 'integer' },
        conditions: { type: 'object', additionalProperties: true },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_mechanism_query', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        const conditions: Record<string, number> = {}
        for (const [key, value] of Object.entries(args.conditions ?? {})) {
          if (typeof value === 'number') conditions[key] = value
        }
        const result = await engine.mechanismGraph(args.projectId).query(args.anchors, args.hops ?? 2, conditions)
        return toToolJson({ ok: true, data: result })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_mechanism_propose_edge',
      description: '提议机理边；established 需理论来源与强支持证据，否则自动降级为候选',
      parameters: {
        projectId: { type: 'string', required: true },
        from: { type: 'string', required: true },
        to: { type: 'string', required: true },
        relation: { type: 'string', enum: ['increases', 'decreases', 'determines', 'couples', 'competes', 'mediates'], required: true },
        equation: { type: 'string' },
        conditions: { type: 'object', additionalProperties: true },
        theoryDoi: { type: 'string' },
        applicability: { type: 'string', enum: ['candidate', 'established'], required: true },
        evidenceIds: { type: 'array', items: { type: 'string' } },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_mechanism_propose_edge', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        let strongCount = 0
        if (args.evidenceIds !== undefined) {
          const records = await engine.queryEvidence(args.projectId)
          const byId = new Map(records.map(item => [item.id, item]))
          for (const id of args.evidenceIds) {
            const record = byId.get(id)
            if (record !== undefined && record.strength === 'strong' && record.polarity === 'supports') strongCount += 1
          }
        }
        const result = await engine.mechanismGraph(args.projectId).addEdge({
          projectId: args.projectId,
          from: args.from,
          to: args.to,
          relation: args.relation,
          ...(args.equation === undefined ? {} : { equation: args.equation }),
          conditions: args.conditions ?? {},
          ...(args.theoryDoi === undefined ? {} : { theorySource: { type: 'doi', ref: args.theoryDoi } }),
          applicability: args.applicability,
          createdBy: 'agent',
          ...(args.evidenceIds === undefined ? {} : { evidenceIds: args.evidenceIds }),
          strongSupportingEvidence: strongCount,
        })
        return toToolJson({ ok: true, data: result })
      },
    }))
  })
}
