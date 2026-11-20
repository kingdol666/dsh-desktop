/** Knowledge (RSI) + scientific-gate tools: reviewer-only review, gate passthrough. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from './service.ts'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson as out } from './tool-json.ts'

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
 * Register knowledge/gate tools.
 * @param ctx - Host context providing the tools service.
 * @param engine - research engine facade.
 */
export function registerKnowledgeTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_knowledge_query',
      description: '检索 RSI 知识卡（scope/status 过滤）',
      parameters: {
        scope: { type: 'string', enum: ['global', 'project', 'agent'] },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'superseded'] },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_knowledge_query', args, exec, resolvePreset)
        if (!auth.ok) return out(auth)
        const items = await engine.knowledge().all()
        const filtered = items.filter(card =>
          (args.scope === undefined || card.scope === args.scope)
          && (args.status === undefined || card.status === args.status))
        return out({ ok: true, data: { items: filtered, total: filtered.length } })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_knowledge_propose',
      description: '提议知识卡（RSI 沉淀：事实/方法/陷阱/决策/候选机理边）',
      parameters: {
        scope: { type: 'string', enum: ['global', 'project', 'agent'], required: true },
        kind: { type: 'string', enum: ['fact', 'method', 'pitfall', 'decision', 'edge-candidate'], required: true },
        title: { type: 'string', required: true },
        body: { type: 'string', required: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_knowledge_propose', args, exec, resolvePreset)
        if (!auth.ok) return out(auth)
        const result = await engine.knowledge().propose({
          scope: args.scope,
          kind: args.kind,
          title: args.title,
          body: args.body,
        }, auth.actor)
        return out({ ok: true, data: result })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_knowledge_review',
      description: '审查知识卡（approve/reject；驳回必须给出理由）',
      parameters: {
        cardId: { type: 'string', required: true },
        decision: { type: 'string', enum: ['approve', 'reject'], required: true },
        rationale: { type: 'string', required: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_knowledge_review', args, exec, resolvePreset)
        if (!auth.ok) return out(auth)
        try {
          const card = await engine.knowledge().review(args.cardId, args.decision, auth.actor, args.rationale)
          if (card === undefined) {
            return out({ ok: false, error: { code: 'NOT_FOUND', message: `card ${args.cardId} not found` } })
          }
          return out({ ok: true, data: { card } })
        } catch (cause) {
          return out({
            ok: false,
            error: { code: 'INVALID_ARGUMENT', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_gate_check',
      description: '科学门控：量纲提示/证据形状/竞争假设/参数范围/光学自洽/理论来源',
      parameters: {
        projectId: { type: 'string', required: true },
        kind: { type: 'string', enum: ['claim', 'edge', 'hypothesis', 'optics', 'model-use'], required: true },
        evidenceIds: { type: 'array', items: { type: 'string' } },
        claim: { type: 'string' },
        edgeId: { type: 'string' },
        opticsDeltaN: { type: 'number' },
        opticsOrientationFactor: { type: 'number' },
        opticsIntrinsicBirefringence: { type: 'number' },
        competitors: { type: 'array', items: { type: 'object', additionalProperties: true } },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args, exec) {
        const auth = deny('pm_gate_check', args, exec, resolvePreset)
        if (!auth.ok) return out(auth)
        let edge
        if (args.edgeId !== undefined) {
          const edges = await engine.mechanismGraph(args.projectId).allEdges()
          edge = edges.find(candidate => candidate.id === args.edgeId)
        }
        const verdict = await engine.gateEvaluate(args.projectId, {
          kind: args.kind,
          ...(args.evidenceIds === undefined ? {} : { evidenceIds: args.evidenceIds }),
          ...(args.claim === undefined ? {} : { claim: args.claim }),
          ...(edge === undefined ? {} : { edge }),
          ...(args.opticsDeltaN === undefined ? {} : {
            optics: {
              deltaN: args.opticsDeltaN,
              ...(args.opticsOrientationFactor === undefined ? {} : { orientationFactor: args.opticsOrientationFactor }),
              ...(args.opticsIntrinsicBirefringence === undefined ? {} : { intrinsicBirefringence: args.opticsIntrinsicBirefringence }),
            },
          }),
          ...(args.competitors === undefined ? {} : { competitors: args.competitors as never }),
        })
        return out({ ok: true, data: verdict })
      },
    }))
  })
}
