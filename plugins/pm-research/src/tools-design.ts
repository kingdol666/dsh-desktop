/** Structured experiment design: factorial matrix, power, sample size, randomization. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson } from './tool-json.ts'

/** One experimental factor with its discrete levels. */
interface DesignFactor {
  readonly name: string
  readonly levels: readonly (string | number)[]
  readonly unit?: string
}

/** Requested response and the smallest effect worth detecting. */
interface DesignResponse {
  readonly name: string
  readonly unit?: string
  readonly effectSize: number
  readonly sigma: number
}

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
      hint: 'allowed presets: polymer-scientist / polymer-physicist / polymer-modeler / polymer-characterization',
    },
  }
}

/** Acklam's inverse normal CDF, accurate to ~1e-9 over (0,1). */
function inverseNormal(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425
  const phigh = 1 - plow
  if (p <= 0 || p >= 1) throw new Error('inverseNormal requires 0 < p < 1')
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
}

/** Deterministic Fisher-Yates shuffle for a reproducible run order. */
function shuffled<T>(values: readonly T[], seed: number): T[] {
  const out = [...values]
  let state = seed >>> 0
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (1664525 * state + 1013904223) >>> 0
    const j = state % (i + 1)
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** Cartesian product of factor levels, in declaration order. */
function factorial(factors: readonly DesignFactor[]): Array<Record<string, string | number>> {
  let rows: Array<Record<string, string | number>> = [{}]
  for (const factor of factors) {
    const next: Array<Record<string, string | number>> = []
    for (const row of rows) {
      for (const level of factor.levels) next.push({ ...row, [factor.name]: level })
    }
    rows = next
    if (rows.length > 2000) throw new Error('factorial design exceeds 2000 cells; reduce levels')
  }
  return rows
}

function asFactors(value: unknown): DesignFactor[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('factors must be a non-empty array')
  if (value.length > 6) throw new Error('at most 6 factors are supported')
  return value.map((raw, index) => {
    const item = raw as Record<string, unknown>
    const name = String(item.name ?? '').trim()
    if (name === '') throw new Error(`factors[${index}].name is required`)
    const levels = item.levels
    if (!Array.isArray(levels) || levels.length < 2) throw new Error(`factors[${index}].levels needs at least 2 levels`)
    if (levels.length > 6) throw new Error(`factors[${index}].levels supports at most 6 levels`)
    const unique = new Set(levels.map(level => String(level)))
    if (unique.size !== levels.length) throw new Error(`factors[${index}].levels contains duplicates`)
    return {
      name,
      levels: levels as Array<string | number>,
      ...(typeof item.unit === 'string' && item.unit !== '' ? { unit: item.unit } : {}),
    }
  })
}

function asResponse(value: unknown): DesignResponse {
  const item = value as Record<string, unknown> | undefined
  if (item === undefined) throw new Error('response is required')
  const name = String(item.name ?? '').trim()
  const effectSize = Number(item.effectSize)
  const sigma = Number(item.sigma)
  if (name === '') throw new Error('response.name is required')
  if (!Number.isFinite(effectSize) || effectSize <= 0) throw new Error('response.effectSize must be > 0')
  if (!Number.isFinite(sigma) || sigma <= 0) throw new Error('response.sigma must be > 0')
  return {
    name,
    effectSize,
    sigma,
    ...(typeof item.unit === 'string' && item.unit !== '' ? { unit: item.unit } : {}),
  }
}

/**
 * Register the experiment-design tool.
 * @param ctx - Host context providing `tools`.
 * @param resolvePreset - live preset resolver (same contract as the other pm tools).
 */
export function registerDesignTools(ctx: Context, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_experiment_plan',
      description: '结构化实验设计：全因子矩阵、功效/每组样本量、随机化与 block；返回可执行计划（不代替真实实验）',
      parameters: {
        factors: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
        response: { type: 'object', required: true, additionalProperties: true },
        alpha: { type: 'number' },
        power: { type: 'number' },
        replicates: { type: 'integer' },
        blocking: { type: 'array', items: { type: 'string' } },
        seed: { type: 'integer' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: render },
      async execute(args: {
        factors: unknown
        response: unknown
        alpha?: number
        power?: number
        replicates?: number
        blocking?: string[]
        seed?: number
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_experiment_plan', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const factors = asFactors(args.factors)
          const response = asResponse(args.response)
          const alpha = args.alpha ?? 0.05
          const power = args.power ?? 0.8
          if (!(alpha > 0.001 && alpha < 0.2)) throw new Error('alpha must be in (0.001, 0.2)')
          if (!(power > 0.5 && power < 0.99)) throw new Error('power must be in (0.5, 0.99)')
          const seed = args.seed ?? 20261121
          const z = inverseNormal(1 - alpha / 2) + inverseNormal(power)
          const standardized = response.effectSize / response.sigma
          const recommended = Math.max(3, Math.ceil((2 * z * z) / (standardized * standardized)))
          if (recommended > 1000) throw new Error('required n per cell exceeds 1000; increase effectSize or reduce sigma')
          const nPerCell = Math.max(3, args.replicates ?? recommended)
          if (nPerCell > 1000) throw new Error('replicates exceeds 1000')
          const rows = factorial(factors)
          const totalRuns = rows.length * nPerCell
          const blocking = (args.blocking ?? []).filter(label => label.trim() !== '')
          const blockLabels = blocking.length > 0 ? blocking : ['batch-1']
          const designMatrix = rows.map((row, index) => ({ cell: index + 1, ...row }))
          const order = shuffled(designMatrix.flatMap(row => Array.from({ length: nPerCell }, (_, rep) => ({ cell: row.cell, replicate: rep + 1, ...row }))), seed)
          const warnings: string[] = []
          if (standardized < 0.2) warnings.push('standardized effect < 0.2: the run count will be large; consider a pilot estimate of sigma')
          if (totalRuns > 500) warnings.push('total runs > 500: split into screening and confirmation stages')
          if (blocking.length === 0) warnings.push('no blocking declared: consider blocking by batch/sample preparation')
          if (blocking.length > 0) warnings.push('assign block labels cyclically to cells in the returned preview; randomize within blocks')
          return toToolJson({
            ok: true,
            data: {
              design: 'full-factorial',
              factors,
              response,
              cells: rows.length,
              sampleSize: {
                alpha,
                power,
                effectSize: response.effectSize,
                sigma: response.sigma,
                standardizedEffect: Number(standardized.toFixed(4)),
                nPerCell,
                recommended,
                replicatesProvided: args.replicates !== undefined,
                formula: 'n = ceil(2*(z_{1-alpha/2}+z_{power})^2/(delta/sigma)^2)',
              },
              totalRuns,
              randomization: { seed, orderPreview: order.slice(0, 60) },
              blocking: { labels: blockLabels, assignment: 'cyclic over cells; randomize within block' },
              designMatrixPreview: designMatrix.slice(0, 60),
              warnings,
              notes: [
                'This is a design plan, not executed data. Run the matrix, then fit the pre-registered model.',
                'Keep the same model/peak table when comparing Xc across conditions.',
                'Report n per cell, randomization seed, blocking, and all exclusions.',
              ],
            },
          })
        } catch (cause) {
          return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: cause instanceof Error ? cause.message : String(cause) } })
        }
      },
    }))
  })
}
