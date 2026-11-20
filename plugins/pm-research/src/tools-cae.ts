/** CAE tools: whole-machine run and coupon through the real engine. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine, CaeRunOutcome } from './service.ts'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson } from './tool-json.ts'

/** Resolved identity or denial envelope. */
type Auth =
  | { readonly ok: true; readonly preset: string; readonly actor: string }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly hint?: string } }

function authorize(tool: string, args: { preset?: string; actor?: string }, exec: ToolRunContext, resolve?: PresetResolver): Auth {
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

/** Evidence fields shared by both CAE tools. */
interface CaeEvidenceArgs {
  readonly claimSupport?: string
  readonly polarity?: 'supports' | 'refutes' | 'neutral'
  readonly strength?: 'strong' | 'moderate' | 'weak'
  readonly record?: boolean
}

/**
 * Cite one CAE outcome in the ledger, unless the caller opted out.
 * @param engine - research engine facade.
 * @param projectId - owning project.
 * @param actor - resolved preset actor.
 * @param tool - tool name used in the claim.
 * @param run - engine outcome.
 * @param args - caller's evidence overrides.
 * @returns the evidence row, or null when record=false.
 */
async function citeCae(
  engine: PmResearchEngine,
  projectId: string,
  actor: string,
  tool: string,
  run: CaeRunOutcome,
  args: CaeEvidenceArgs,
): Promise<{ evidence: unknown; deduped: boolean } | null> {
  if (args.record === false) return null
  const energy = typeof run.result.solver?.energy === 'number' ? `energy=${run.result.solver.energy.toFixed(3)} J` : 'energy=n/a'
  const claim = args.claimSupport
    ?? `${tool}: ${String(run.summary.status)} valid=${String(run.summary.valid)} ${energy} model=${String(run.summary.model)}`
  const { evidence, deduped } = await engine.recordEvidence(projectId, {
    claimSupport: claim,
    polarity: args.polarity ?? 'neutral',
    strength: args.strength ?? 'moderate',
    sourceRef: { type: 'run', ref: run.artifactPath ?? `cae:${String(run.summary.model)}` },
    payload: { ...run, tool },
    recordedBy: actor,
  })
  return { evidence, deduped }
}

/**
 * Register CAE tools.
 * @param ctx - Host context providing the tools service.
 * @param engine - research engine facade (requires caeRoot configured).
 * @param resolvePreset - optional live preset lookup.
 */
export function registerCaeTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_cae_coupon',
      description: '真实引擎 affine 验证 coupon（秒级）：判别扫描/健康检查，结果归档并登记证据',
      parameters: {
        projectId: { type: 'string', required: true },
        stretchX: { type: 'number', required: true },
        stretchY: { type: 'number', required: true },
        mesh: { type: 'string' },
        claimSupport: { type: 'string' },
        polarity: { type: 'string', enum: ['supports', 'refutes', 'neutral'] },
        strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
        record: { type: 'boolean' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: CaeEvidenceArgs & {
        projectId: string
        stretchX: number
        stretchY: number
        mesh?: string
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_cae_coupon', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const run = await engine.runCaeCoupon(args.projectId, {
            stretchX: args.stretchX,
            stretchY: args.stretchY,
            ...(args.mesh === undefined ? {} : { mesh: args.mesh }),
          })
          const cited = await citeCae(engine, args.projectId, auth.actor, 'pm_cae_coupon', run, args)
          return toToolJson({ ok: true, data: { ...run, evidence: cited?.evidence ?? null, deduped: cited?.deduped ?? false } })
        } catch (cause) {
          return toToolJson({
            ok: false,
            error: { code: 'CAE_UNAVAILABLE', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_cae_run',
      description: '真实引擎全流程求解（产物 metrics + provenance 哈希），归档并登记证据',
      parameters: {
        projectId: { type: 'string', required: true },
        params: { type: 'object', additionalProperties: true },
        claimSupport: { type: 'string' },
        polarity: { type: 'string', enum: ['supports', 'refutes', 'neutral'] },
        strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
        record: { type: 'boolean' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: CaeEvidenceArgs & {
        projectId: string
        params?: Record<string, unknown>
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_cae_run', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const run = await engine.runCaeRun(args.projectId, args.params)
          const cited = await citeCae(engine, args.projectId, auth.actor, 'pm_cae_run', run, args)
          return toToolJson({ ok: true, data: { ...run, evidence: cited?.evidence ?? null, deduped: cited?.deduped ?? false } })
        } catch (cause) {
          return toToolJson({
            ok: false,
            error: { code: 'CAE_UNAVAILABLE', message: cause instanceof Error ? cause.message : String(cause) },
          })
        }
      },
    }))
  })
}
