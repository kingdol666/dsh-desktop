/** Characterization and literature tools backed by the real science engine. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { PmResearchEngine } from './service.ts'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson } from './tool-json.ts'
import {
  readCsvSeries,
  resolveDataPath,
  runScience,
  ScienceFailure,
  ScienceUnavailable,
  sessionWorkspace,
  type ScienceTool,
} from './science.ts'

/** Shared optional authorization fields. */
interface ScienceArgs {
  readonly projectId: string
  readonly preset?: string
  readonly actor?: string
  readonly claimSupport?: string
  readonly polarity?: 'supports' | 'refutes' | 'neutral'
  readonly strength?: 'strong' | 'moderate' | 'weak'
  readonly record?: boolean
}

/** Resolved identity for one authorized call. */
interface Auth {
  readonly ok: true
  readonly preset: string
  readonly actor: string
}

/** Permission refusal envelope. */
interface Denial {
  readonly ok: false
  readonly error: { readonly code: string; readonly message: string; readonly hint?: string }
}

/** Authorize or return the denial envelope, plus the resolved actor. */
function authorize(
  tool: string,
  args: Pick<ScienceArgs, 'preset' | 'actor'>,
  exec: ToolRunContext,
  resolve?: PresetResolver,
): Auth | Denial {
  const preset = actingPreset(args, exec, resolve)
  if (preset === undefined || !canUseTool(tool, preset)) {
    return {
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: `preset ${preset ?? '(unattributed)'} may not call ${tool}`,
        hint: 'allowed presets: docs/polymechanism/09-API与工具契约.md §6',
      },
    }
  }
  return { ok: true, preset, actor: args.actor ?? `preset:${preset}` }
}

function failure(cause: unknown): Record<string, unknown> {
  if (cause instanceof ScienceUnavailable || cause instanceof ScienceFailure) {
    return { ok: false, error: { code: cause.code, message: cause.message } }
  }
  return { ok: false, error: { code: 'TOOL_FAILED', message: cause instanceof Error ? cause.message : String(cause) } }
}

/** One CSV-backed analysis tool body. */
async function analyze(
  tool: string,
  scienceTool: ScienceTool,
  args: ScienceArgs & {
    readonly dataPath: string
    readonly xColumn?: string | undefined
    readonly yColumn?: string | undefined
    readonly zColumn?: string | undefined
  },
  exec: ToolRunContext,
  engine: PmResearchEngine,
  toRequest: (series: Awaited<ReturnType<typeof readCsvSeries>>) => Record<string, unknown>,
  describe: (result: Record<string, unknown>) => string,
  resolvePreset?: PresetResolver,
): Promise<Record<string, never>> {
  const auth = authorize(tool, args, exec, resolvePreset)
  if (!auth.ok) return toToolJson(auth)
  try {
    const root = sessionWorkspace(exec.agent)
    const path = resolveDataPath(args.dataPath, root)
    const series = await readCsvSeries(path, {
      ...(args.xColumn === undefined ? {} : { x: args.xColumn }),
      ...(args.yColumn === undefined ? {} : { y: args.yColumn }),
      ...(args.zColumn === undefined ? {} : { z: args.zColumn }),
    })
    const result = await runScience(scienceTool, toRequest(series), { signal: exec.signal })
    if (args.record === false) return toToolJson({ ok: true, data: { analysis: result, evidence: null } })
    const recorded = await engine.recordAnalysis(args.projectId, {
      tool,
      result,
      dataPath: path,
      claimSupport: args.claimSupport ?? describe(result),
      ...(args.polarity === undefined ? {} : { polarity: args.polarity }),
      ...(args.strength === undefined ? {} : { strength: args.strength }),
      recordedBy: auth.actor,
    })
    return toToolJson({
      ok: true,
      data: {
        analysis: result,
        evidence: recorded.evidence,
        artifactPath: recorded.artifactPath,
        deduped: recorded.deduped,
      },
    })
  } catch (cause) {
    return toToolJson(failure(cause))
  }
}

const STRENGTH = { type: 'string', enum: ['strong', 'moderate', 'weak'] } as const
const POLARITY = { type: 'string', enum: ['supports', 'refutes', 'neutral'] } as const

function commonParameters(): Record<string, unknown> {
  return {
    projectId: { type: 'string', required: true },
    claimSupport: { type: 'string' },
    polarity: POLARITY,
    strength: STRENGTH,
    record: { type: 'boolean' },
    preset: { type: 'string' },
    actor: { type: 'string' },
  }
}

/**
 * Register the characterization and literature tools.
 * @param ctx - Host context providing `tools`.
 * @param engine - research engine facade.
 */
export function registerScienceTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_waxs_analyze',
      description: 'WAXS 1-D 分析：非晶晕+结晶峰分解，返回结晶度/峰表/拟合质量，并登记证据',
      parameters: {
        ...commonParameters(),
        dataPath: { type: 'string', required: true },
        xColumn: { type: 'string' },
        yColumn: { type: 'string' },
        haloCenter: { type: 'number' },
        peakCenters: { type: 'array', items: { type: 'number' } },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ScienceArgs & { dataPath: string; xColumn?: string; yColumn?: string; haloCenter?: number; peakCenters?: number[] }, exec) {
        return analyze('pm_waxs_analyze', 'waxs', args, exec, engine, series => ({
          twoTheta: series.x,
          intensity: series.y,
          ...(args.haloCenter === undefined ? {} : { haloCenter: args.haloCenter }),
          ...(args.peakCenters === undefined ? {} : { peakCenters: args.peakCenters }),
        }), result => `WAXS: crystallinity index ${String(result.crystallinityIndex)}; 2θ peaks ${JSON.stringify(result.peaks)}`, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_ftir_analyze',
      description: 'FTIR 峰分解：伪 Voigt 拟合，返回峰表/氢键指数/羰基指数/拟合质量，并登记证据',
      parameters: {
        ...commonParameters(),
        dataPath: { type: 'string', required: true },
        xColumn: { type: 'string' },
        yColumn: { type: 'string' },
        peakCenters: { type: 'array', items: { type: 'number' } },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ScienceArgs & { dataPath: string; xColumn?: string; yColumn?: string; peakCenters?: number[] }, exec) {
        return analyze('pm_ftir_analyze', 'ftir', args, exec, engine, series => ({
          wavenumber: series.x,
          absorbance: series.y,
          ...(args.peakCenters === undefined ? {} : { peakCenters: args.peakCenters }),
        }), result => `FTIR: H-bond index ${String(result.hbondIndex)}; carbonyl index ${String(result.carbonylIndex)}; peaks ${JSON.stringify(result.peaks)}`, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_saxs_analyze',
      description: 'SAXS 1-D 归约：Guinier Rg + Porod 斜率（可带背景列），并登记证据',
      parameters: {
        ...commonParameters(),
        dataPath: { type: 'string', required: true },
        xColumn: { type: 'string' },
        yColumn: { type: 'string' },
        backgroundColumn: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ScienceArgs & { dataPath: string; xColumn?: string; yColumn?: string; backgroundColumn?: string }, exec) {
        return analyze('pm_saxs_analyze', 'saxs', {
          ...args,
          zColumn: args.backgroundColumn,
        }, exec, engine, series => ({
          q: series.x,
          intensity: series.y,
          ...(series.z === undefined ? {} : { background: series.z }),
        }), result => `SAXS: Guinier ${JSON.stringify(result.guinier)}; Porod ${JSON.stringify(result.porod)}`, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_hermans_analyze',
      description: '方位角扫描 → Hermans 取向因子 f（含峰位/展宽），并登记证据',
      parameters: {
        ...commonParameters(),
        dataPath: { type: 'string', required: true },
        azimuthColumn: { type: 'string' },
        intensityColumn: { type: 'string' },
        baseline: { type: 'number' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ScienceArgs & { dataPath: string; azimuthColumn?: string; intensityColumn?: string; baseline?: number }, exec) {
        return analyze('pm_hermans_analyze', 'hermans', {
          ...args,
          xColumn: args.azimuthColumn,
          yColumn: args.intensityColumn,
        }, exec, engine, series => ({
          azimuth: series.x,
          intensity: series.y,
          ...(args.baseline === undefined ? {} : { baseline: args.baseline }),
        }), result => `Hermans orientation f=${String(result.hermansFactor)} at ${String(result.angleOfMaxDeg)}°`, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_model_fit',
      description: '应力/取向松弛拟合：Maxwell 或 KWW（τ、β、rmse、r²），并登记证据',
      parameters: {
        ...commonParameters(),
        dataPath: { type: 'string', required: true },
        timeColumn: { type: 'string' },
        signalColumn: { type: 'string' },
        model: { type: 'string', enum: ['maxwell', 'kww'], required: true },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ScienceArgs & { dataPath: string; timeColumn?: string; signalColumn?: string; model: 'maxwell' | 'kww' }, exec) {
        return analyze('pm_model_fit', 'relax', {
          ...args,
          xColumn: args.timeColumn,
          yColumn: args.signalColumn,
        }, exec, engine, series => ({
          time: series.x,
          signal: series.y,
          model: args.model,
        }), result => `${args.model.toUpperCase()} fit: params ${JSON.stringify(result.params)}; r² ${String((result.fit as { r2?: unknown } | undefined)?.r2)}`, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_literature_read',
      description: '读取工作区内的 PDF/TXT/MD 文献并返回文本与元数据（PDF 用 pypdf）',
      parameters: {
        path: { type: 'string', required: true },
        maxChars: { type: 'integer' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: { path: string; maxChars?: number; preset?: string; actor?: string }, exec) {
        const auth = authorize('pm_literature_read', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const root = sessionWorkspace(exec.agent)
          const path = resolveDataPath(args.path, root)
          const limit = Math.min(Math.max(args.maxChars ?? 16_000, 1_000), 30_000)
          if (!/\.pdf$/iu.test(path)) {
            const { readFile } = await import('node:fs/promises')
            const text = await readFile(path, 'utf8')
            return toToolJson({
              ok: true,
              data: {
                status: 'OK', path, pages: null, title: null, author: null,
                chars: text.length, truncated: text.length > limit, text: text.slice(0, limit),
              },
            })
          }
          const result = await runScience('literature_read', { path, maxChars: limit }, { signal: exec.signal })
          return toToolJson({ ok: true, data: result })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_literature_extract',
      description: '把已阅读文献的结构化结论逐条登记为 DOI/文件证据',
      parameters: {
        projectId: { type: 'string', required: true },
        sourceType: { type: 'string', enum: ['doi', 'file'], required: true },
        sourceRef: { type: 'string', required: true },
        title: { type: 'string', required: true },
        claims: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claim: { type: 'string' },
              polarity: POLARITY,
              strength: STRENGTH,
            },
          },
        },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        projectId: string
        sourceType: 'doi' | 'file'
        sourceRef: string
        title: string
        claims: { claim?: string; polarity?: 'supports' | 'refutes' | 'neutral'; strength?: 'strong' | 'moderate' | 'weak' }[]
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_literature_extract', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        if (args.claims.length === 0) {
          return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'claims must not be empty' } })
        }
        try {
          const recorded: unknown[] = []
          for (const item of args.claims) {
            const claim = item.claim?.trim()
            if (claim === undefined || claim === '') continue
            const { evidence, deduped } = await engine.recordEvidence(args.projectId, {
              claimSupport: claim,
              polarity: item.polarity ?? 'neutral',
              strength: item.strength ?? 'moderate',
              sourceRef: { type: args.sourceType, ref: args.sourceRef },
              payload: { literature: args.title, claim },
              recordedBy: auth.actor,
            })
            recorded.push({ evidence, deduped })
          }
          return toToolJson({ ok: true, data: { title: args.title, sourceRef: args.sourceRef, recorded } })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))
  })
}
