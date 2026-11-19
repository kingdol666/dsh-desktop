/** Agent-facing pm tools: permission-checked handlers over the research engine. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from './service.ts'
import { canUseTool } from './permissions.ts'
import { registerMechanismTools } from './tools-mechanism.ts'
import { registerKnowledgeTools } from './tools-knowledge.ts'

/**
 * Boundary cast: tool outputs cross the model JSON frontier, so handlers build
 * plain JSON-safe envelopes and hand them to the runtime as its record type.
 */
function toToolJson(value: unknown): Record<string, never> {
  return value as never
}

/** Structured tool envelope (docs 09 §1). */
type PmEnvelope = Record<string, unknown>

function failure(code: string, message: string, hint?: string): PmEnvelope {
  return hint === undefined ? { ok: false, error: { code, message } } : { ok: false, error: { code, message, hint } }
}

/** Common arguments every pm tool accepts for authorization. */
interface AuthArgs {
  readonly preset?: string
  readonly actor?: string
}

/** Authorize or produce a PERMISSION_DENIED envelope. */
function authorize(tool: string, args: AuthArgs): PmEnvelope | undefined {
  if (!canUseTool(tool, args.preset)) {
    return failure(
      'PERMISSION_DENIED',
      `preset ${args.preset ?? '(unattributed)'} may not call ${tool}`,
      'allowed presets: docs/polymechanism/09-API与工具契约.md §6',
    )
  }
  return undefined
}

/** Shared render for JSON envelopes. */
function renderJson(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/**
 * Register every pm tool on the Host tool runtime.
 * @param ctx - Host context providing `tools`.
 * @param engine - research engine facade.
 */
export function registerPmTools(ctx: Context, engine: PmResearchEngine): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_project_create',
      description: '创建高分子科研项目（题目 + 机理问题 + 领域）',
      parameters: {
        title: { type: 'string', required: true },
        question: { type: 'string', required: true },
        domain: { type: 'string', enum: ['pva-optical-film', 'generic-polymer'], required: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_project_create', args)
        if (denied !== undefined) return toToolJson(denied)
        const project = await engine.createProject({
          title: args.title,
          question: args.question,
          domain: args.domain,
        }, args.actor ?? `preset:${args.preset ?? 'unknown'}`)
        return toToolJson({ ok: true, data: { project } })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_evidence_record',
      description: '登记一条可引用证据（自动哈希与去重）',
      parameters: {
        projectId: { type: 'string', required: true },
        claimSupport: { type: 'string', required: true },
        polarity: { type: 'string', enum: ['supports', 'refutes', 'neutral'], required: true },
        strength: { type: 'string', enum: ['strong', 'moderate', 'weak'], required: true },
        sourceType: { type: 'string', enum: ['doi', 'dataset', 'file', 'run'], required: true },
        sourceRef: { type: 'string', required: true },
        payload: { type: 'object', additionalProperties: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_evidence_record', args)
        if (denied !== undefined) return toToolJson(denied)
        try {
          const { evidence, deduped } = await engine.recordEvidence(args.projectId, {
            claimSupport: args.claimSupport,
            polarity: args.polarity,
            strength: args.strength,
            sourceRef: { type: args.sourceType, ref: args.sourceRef },
            ...(args.payload === undefined ? {} : { payload: args.payload }),
            recordedBy: args.actor ?? `preset:${args.preset ?? 'unknown'}`,
          })
          return toToolJson({ ok: true, data: { evidence, deduped } })
        } catch (cause) {
          return toToolJson(failure('NOT_FOUND', cause instanceof Error ? cause.message : String(cause), 'create the project first with pm_project_create'))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_evidence_query',
      description: '查询项目的证据账本',
      parameters: {
        projectId: { type: 'string', required: true },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_evidence_query', args)
        if (denied !== undefined) return toToolJson(denied)
        const items = await engine.queryEvidence(args.projectId)
        return toToolJson({ ok: true, data: { items, total: items.length } })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_evidence_verify',
      description: '校验项目证据链的哈希完整性',
      parameters: {
        projectId: { type: 'string', required: true },
        preset: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_evidence_verify', args)
        if (denied !== undefined) return toToolJson(denied)
        return toToolJson({ ok: true, data: await engine.verifyEvidence(args.projectId) })
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_hypothesis_propose',
      description: '提出科研假设（状态 proposed，必须可被证据迁移）',
      parameters: {
        projectId: { type: 'string', required: true },
        statement: { type: 'string', required: true },
        competitors: { type: 'array', items: { type: 'string' } },
        mechanismEdgeIds: { type: 'array', items: { type: 'string' } },
        evidenceIds: { type: 'array', items: { type: 'string' } },
        testDesign: {
          type: 'object',
          additionalProperties: false,
          properties: {
            design: { type: 'string' },
            observable: { type: 'string' },
            expectedIfTrue: { type: 'string' },
            expectedIfFalse: { type: 'string' },
          },
        },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_hypothesis_propose', args)
        if (denied !== undefined) return toToolJson(denied)
        const test = args.testDesign === undefined ? undefined : {
          design: args.testDesign.design ?? '',
          observable: args.testDesign.observable ?? '',
          expectedIfTrue: args.testDesign.expectedIfTrue ?? '',
          expectedIfFalse: args.testDesign.expectedIfFalse ?? '',
        }
        try {
          const hypothesis = await engine.proposeHypothesis(args.projectId, {
            statement: args.statement,
            competitors: args.competitors ?? [],
            mechanismEdgeIds: args.mechanismEdgeIds ?? [],
            evidenceIds: args.evidenceIds ?? [],
            ...(test === undefined ? {} : { discriminatingTest: test }),
          }, args.actor ?? `preset:${args.preset ?? 'unknown'}`)
          return toToolJson({ ok: true, data: { hypothesis } })
        } catch (cause) {
          return toToolJson(failure('NOT_FOUND', cause instanceof Error ? cause.message : String(cause), 'create the project first with pm_project_create'))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_hypothesis_transition',
      description: '假设状态迁移（服务端状态机 + 证据门槛强制）',
      parameters: {
        projectId: { type: 'string', required: true },
        hypothesisId: { type: 'string', required: true },
        to: { type: 'string', enum: ['conditional', 'under_test', 'supported', 'refuted', 'archived'], required: true },
        rationale: { type: 'string', required: true },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
      async execute(args) {
        const denied = authorize('pm_hypothesis_transition', args)
        if (denied !== undefined) return toToolJson(denied)
        const verdict = await engine.transitionHypothesis(args.projectId, args.hypothesisId, args.to, args.rationale, args.actor ?? `preset:${args.preset ?? 'unknown'}`)
        if (!verdict.legal) {
          return toToolJson(failure('GATE_BLOCKED', verdict.reason ?? 'transition blocked', 'cite more/stronger evidence via pm_evidence_record, then retry'))
        }
        return toToolJson({ ok: true, data: { hypothesis: verdict.hypothesis } })
      },
    }))

    registerMechanismTools(ctx, engine)
    registerKnowledgeTools(ctx, engine)
  })
}
