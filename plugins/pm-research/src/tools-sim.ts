/** Polymer simulation tools: analytic physics models behind the science bridge. */

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

/** Shared authorization + evidence fields. */
interface SimArgs {
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

function authorize(
  tool: string,
  args: Pick<SimArgs, 'preset' | 'actor'>,
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

/** Shared optional parameter block on every sim tool. */
function commonParameters(): Record<string, unknown> {
  return {
    claimSupport: { type: 'string' },
    polarity: { type: 'string', enum: ['supports', 'refutes', 'neutral'] },
    strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
    record: { type: 'boolean' },
    preset: { type: 'string' },
    actor: { type: 'string' },
  }
}

/**
 * Archive one simulation result and cite it as engine-backed evidence.
 * The claim is derived from the model output unless the caller overrides it.
 */
async function citeSim(
  tool: string,
  engine: PmResearchEngine,
  projectId: string,
  args: SimArgs,
  auth: Auth,
  result: Record<string, unknown>,
  describe: (result: Record<string, unknown>) => string,
): Promise<{ evidence: unknown; artifactPath: string; deduped: boolean }> {
  return engine.recordSimulation(projectId, {
    tool,
    result,
    claimSupport: args.claimSupport ?? describe(result),
    ...(args.polarity === undefined ? {} : { polarity: args.polarity }),
    ...(args.strength === undefined ? {} : { strength: args.strength }),
    recordedBy: auth.actor,
  })
}

/** One pure-args simulation tool body: authorize → bridge → archive → envelope. */
async function simulate(
  tool: string,
  scienceTool: ScienceTool,
  args: SimArgs,
  request: Record<string, unknown>,
  exec: ToolRunContext,
  engine: PmResearchEngine,
  describe: (result: Record<string, unknown>) => string,
  resolvePreset?: PresetResolver,
): Promise<Record<string, never>> {
  const auth = authorize(tool, args, exec, resolvePreset)
  if (!auth.ok) return toToolJson(auth)
  try {
    const result = await runScience(scienceTool, request, { signal: exec.signal })
    if (args.record === false) return toToolJson({ ok: true, data: { simulation: result, evidence: null } })
    const recorded = await citeSim(tool, engine, args.projectId, args, auth, result, describe)
    return toToolJson({ ok: true, data: { simulation: result, ...recorded } })
  } catch (cause) {
    return toToolJson(failure(cause))
  }
}

/** Run a data-backed fit tool: workspace CSV in, fitted parameters out. */
async function simulateFromCsv(
  tool: string,
  scienceTool: ScienceTool,
  args: SimArgs & { readonly dataPath: string; readonly xColumn?: string; readonly yColumn?: string },
  buildRequest: (series: Awaited<ReturnType<typeof readCsvSeries>>) => Record<string, unknown>,
  exec: ToolRunContext,
  engine: PmResearchEngine,
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
    })
    const result = await runScience(scienceTool, buildRequest(series), { signal: exec.signal })
    if (args.record === false) return toToolJson({ ok: true, data: { simulation: result, dataPath: path, evidence: null } })
    const recorded = await citeSim(tool, engine, args.projectId, args, auth, result, describe)
    return toToolJson({ ok: true, data: { simulation: result, dataPath: path, ...recorded } })
  } catch (cause) {
    return toToolJson(failure(cause))
  }
}

const STRENGTH = { type: 'string', enum: ['strong', 'moderate', 'weak'] } as const
const POLARITY = { type: 'string', enum: ['supports', 'refutes', 'neutral'] } as const

/**
 * Register the polymer simulation tools (analytic layer A of docs 10).
 * @param ctx - Host context providing `tools`.
 * @param engine - research engine facade.
 * @param resolvePreset - optional live preset lookup.
 */
export function registerSimTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_sim_chain_mechanics',
      description: '单链力学（FJC 精确 Langevin / WLC Marko-Siggia）：力-伸长曲线或单点探针，登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        model: { type: 'string', enum: ['fjc', 'wlc'], required: true },
        contourNm: { type: 'number', required: true },
        temperatureK: { type: 'number', required: true },
        segmentNm: { type: 'number' },
        persistenceNm: { type: 'number' },
        probeForcePn: { type: 'number' },
        probeExtensionNm: { type: 'number' },
        gridPoints: { type: 'integer' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        model: 'fjc' | 'wlc'
        contourNm: number
        temperatureK: number
        segmentNm?: number
        persistenceNm?: number
        probeForcePn?: number
        probeExtensionNm?: number
        gridPoints?: number
      }, exec) {
        return simulate('pm_sim_chain_mechanics', 'chain_mech', args, {
          model: args.model,
          contourNm: args.contourNm,
          temperatureK: args.temperatureK,
          ...(args.segmentNm === undefined ? {} : { segmentNm: args.segmentNm }),
          ...(args.persistenceNm === undefined ? {} : { persistenceNm: args.persistenceNm }),
          ...(args.probeForcePn === undefined ? {} : { probeForcePn: args.probeForcePn }),
          ...(args.probeExtensionNm === undefined ? {} : { probeExtensionNm: args.probeExtensionNm }),
          ...(args.gridPoints === undefined ? {} : { gridPoints: args.gridPoints }),
        }, exec, engine, result => {
          const probe = result.probe as { forcePn?: number; extensionNm?: number } | undefined
          return probe !== undefined
            ? `chain ${String(result.model)}: probe force=${String(probe.forcePn)} pN at ${String(probe.extensionNm)} nm`
            : `chain ${String(result.model)} curve over contour ${String(result.contourNm)} nm`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_rubber_elasticity',
      description: '8-chain 橡胶弹性（Arruda-Boyce）：主应力/名义应力/变形功密度（NH 极限参照），判别实验的仿真支点',
      parameters: {
        projectId: { type: 'string', required: true },
        mode: { type: 'string', enum: ['uniaxial', 'biaxial'], required: true },
        shearModulusMPa: { type: 'number', required: true },
        linksPerChain: { type: 'integer', required: true },
        stretchX: { type: 'number' },
        stretchY: { type: 'number' },
        maxStretch: { type: 'number' },
        gridPoints: { type: 'integer' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        mode: 'uniaxial' | 'biaxial'
        shearModulusMPa: number
        linksPerChain: number
        stretchX?: number
        stretchY?: number
        maxStretch?: number
        gridPoints?: number
      }, exec) {
        return simulate('pm_sim_rubber_elasticity', 'rubber', args, {
          mode: args.mode,
          shearModulusMPa: args.shearModulusMPa,
          linksPerChain: args.linksPerChain,
          ...(args.stretchX === undefined ? {} : { stretchX: args.stretchX }),
          ...(args.stretchY === undefined ? {} : { stretchY: args.stretchY }),
          ...(args.maxStretch === undefined ? {} : { maxStretch: args.maxStretch }),
          ...(args.gridPoints === undefined ? {} : { gridPoints: args.gridPoints }),
        }, exec, engine, result => {
          const work = result.workPerVolMPa as number | null
          const stress = result.stressTrueMPa as number[]
          return `8-chain ${String(result.mode)}: lambdaChain=${String(result.lambdaChain)} sigmaDiff=${(stress[0]! - stress[1]!).toFixed(4)} MPa work=${String(work)} MPa`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_viscoelastic',
      description: '线性粘弹：Rouse 模谱（τp=τ₁/p²、G(t)、G\'/G\'\'）或 WLF/VFT 时温位移因子，登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        part: { type: 'string', enum: ['rouse', 'shift'], required: true },
        shiftModel: { type: 'string', enum: ['wlf', 'vft'] },
        beadsPerChain: { type: 'integer' },
        kuhnLengthNm: { type: 'number' },
        frictionPerBead: { type: 'number' },
        chainNumberDensity: { type: 'number' },
        temperatureK: { type: 'number' },
        referenceTemperatureK: { type: 'number' },
        temperaturesK: { type: 'array', items: { type: 'number' } },
        c1: { type: 'number' },
        c2K: { type: 'number' },
        vftTinfK: { type: 'number' },
        modesReported: { type: 'integer' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        part: 'rouse' | 'shift'
        shiftModel?: 'wlf' | 'vft'
        beadsPerChain?: number
        kuhnLengthNm?: number
        frictionPerBead?: number
        chainNumberDensity?: number
        temperatureK?: number
        referenceTemperatureK?: number
        temperaturesK?: number[]
        c1?: number
        c2K?: number
        vftTinfK?: number
        modesReported?: number
      }, exec) {
        const request: Record<string, unknown> = { part: args.part }
        if (args.part === 'rouse') {
          for (const key of ['beadsPerChain', 'kuhnLengthNm', 'frictionPerBead', 'chainNumberDensity', 'temperatureK'] as const) {
            if (args[key] === undefined) {
              return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: `rouse needs ${key}` } })
            }
            request[key] = args[key]
          }
          if (args.modesReported !== undefined) request.modesReported = args.modesReported
        } else {
          if (args.referenceTemperatureK === undefined || args.temperaturesK === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'shift needs referenceTemperatureK and temperaturesK' } })
          }
          request.referenceTemperatureK = args.referenceTemperatureK
          request.temperaturesK = args.temperaturesK
          if (args.shiftModel !== undefined) request.shiftModel = args.shiftModel
          if (args.c1 !== undefined) request.c1 = args.c1
          if (args.c2K !== undefined) request.c2K = args.c2K
          if (args.vftTinfK !== undefined) request.vftTinfK = args.vftTinfK
        }
        return simulate('pm_sim_viscoelastic', 'viscoelastic', args, request, exec, engine, result => {
          if (typeof result.tau1S === 'number') {
            return `Rouse tau1=${result.tau1S.toExponential(3)} s; G0=${String(result.G0Pa)} Pa`
          }
          const shift = result.shift as { log10aT: number[]; temperatureK: number[] }
          return `${String(result.model)} shift: log10aT=${shift.log10aT.map(v => v.toFixed(3)).join(', ')} at ${shift.temperatureK.join(', ')} K`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_chain_stats',
      description: '链统计：理想链 Rg/末端距 + 仿射取向 f（可对照实测 Hermans f），登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        beadsPerChain: { type: 'integer', required: true },
        kuhnLengthNm: { type: 'number', required: true },
        stretchX: { type: 'number' },
        stretchY: { type: 'number' },
        stretchZ: { type: 'number' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        beadsPerChain: number
        kuhnLengthNm: number
        stretchX?: number
        stretchY?: number
        stretchZ?: number
      }, exec) {
        return simulate('pm_sim_chain_stats', 'chain_stats', args, {
          beadsPerChain: args.beadsPerChain,
          kuhnLengthNm: args.kuhnLengthNm,
          ...(args.stretchX === undefined ? {} : { stretchX: args.stretchX }),
          ...(args.stretchY === undefined ? {} : { stretchY: args.stretchY }),
          ...(args.stretchZ === undefined ? {} : { stretchZ: args.stretchZ }),
        }, exec, engine, result => {
          const orientation = result.orientation as { orientationF: number; lambdaChain: number }
          const size = result.size as { radiusOfGyrationNm: number }
          return `affine prediction f=${orientation.orientationF.toFixed(4)} at lambdaChain=${orientation.lambdaChain.toFixed(3)}; Rg=${size.radiusOfGyrationNm.toFixed(3)} nm`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_crystallization',
      description: 'Avrami 结晶动力学拟合 X(t)=1−exp(−Ktⁿ)：n、K、半结晶时间，登记仿真证据（对照 WAXS 结晶度时序）',
      parameters: {
        projectId: { type: 'string', required: true },
        dataPath: { type: 'string', required: true },
        timeColumn: { type: 'string' },
        crystallinityColumn: { type: 'string' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & { dataPath: string; timeColumn?: string; crystallinityColumn?: string }, exec) {
        return simulateFromCsv('pm_sim_crystallization', 'avrami', args, series => ({
          time: series.x,
          crystallinity: series.y,
        }), exec, engine, result => {
          const fit = result.fit as { r2: number }
          return `Avrami n=${String(result.n)} K=${String(result.K)} halfTime=${String(result.halfTimeS)} s (r²=${fit.r2})`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_flory_huggins',
      description: 'Flory-Huggins 相行为：旋节线 χ、临界点（φc/χc/Tc）与给定 χ 的相容性判定，登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        n1: { type: 'integer', required: true },
        n2: { type: 'integer', required: true },
        chi: { type: 'number' },
        chiA: { type: 'number' },
        chiB: { type: 'number' },
        temperatureK: { type: 'number' },
        phi: { type: 'number' },
        gridPoints: { type: 'integer' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        n1: number
        n2: number
        chi?: number
        chiA?: number
        chiB?: number
        temperatureK?: number
        phi?: number
        gridPoints?: number
      }, exec) {
        if (args.chi === undefined && args.chiA === undefined) {
          return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'either chi, or chiA with temperatureK, is required' } })
        }
        return simulate('pm_sim_flory_huggins', 'flory', args, {
          n1: args.n1,
          n2: args.n2,
          ...(args.chi === undefined ? {} : { chi: args.chi }),
          ...(args.chiA === undefined ? {} : { chiA: args.chiA }),
          ...(args.chiB === undefined ? {} : { chiB: args.chiB }),
          ...(args.temperatureK === undefined ? {} : { temperatureK: args.temperatureK }),
          ...(args.phi === undefined ? {} : { phi: args.phi }),
          ...(args.gridPoints === undefined ? {} : { gridPoints: args.gridPoints }),
        }, exec, engine, result => {
          const critical = result.critical as { chiCritical: number }
          return `FH chi=${String(result.chi)} vs spinodal ${String(result.spinodalChi)} (chiCritical=${critical.chiCritical}) → ${String(result.verdict)}`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_tg_blend',
      description: '玻璃化转变：Fox-Flory 拟合/预测（Tg∞、K）或 Gordon-Taylor 共混 Tg，登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        part: { type: 'string', enum: ['fox-flory-fit', 'fox-flory-predict', 'gordon-taylor'], required: true },
        dataPath: { type: 'string' },
        massColumn: { type: 'string' },
        tgColumn: { type: 'string' },
        tgInfinityK: { type: 'number' },
        constantK: { type: 'number' },
        predictMolarMass: { type: 'number' },
        weight1: { type: 'number' },
        tg1K: { type: 'number' },
        weight2: { type: 'number' },
        tg2K: { type: 'number' },
        kConstant: { type: 'number' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        part: 'fox-flory-fit' | 'fox-flory-predict' | 'gordon-taylor'
        dataPath?: string
        massColumn?: string
        tgColumn?: string
        tgInfinityK?: number
        constantK?: number
        predictMolarMass?: number
        weight1?: number
        tg1K?: number
        weight2?: number
        tg2K?: number
        kConstant?: number
      }, exec) {
        if (args.part === 'fox-flory-fit') {
          if (args.dataPath === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'fox-flory-fit needs dataPath (mass, Tg columns)' } })
          }
          return simulateFromCsv('pm_sim_tg_blend', 'tg_blend', args, series => ({
            part: 'fox-flory-fit',
            molarMass: series.x,
            tgK: series.y,
          }), exec, engine, result => `Fox-Flory TgInfinity=${String(result.TgInfinityK)} K, K=${String(result.K)} K·g/mol (r²=${String((result.fit as { r2?: number }).r2)})`, resolvePreset)
        }
        const request: Record<string, unknown> = { part: args.part }
        if (args.part === 'fox-flory-predict') {
          if (args.tgInfinityK === undefined || args.constantK === undefined || args.predictMolarMass === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'fox-flory-predict needs tgInfinityK, constantK, predictMolarMass' } })
          }
          request.tgInfinityK = args.tgInfinityK
          request.constantK = args.constantK
          request.predictMolarMass = args.predictMolarMass
        } else {
          if (args.weight1 === undefined || args.tg1K === undefined || args.weight2 === undefined || args.tg2K === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'gordon-taylor needs weight1/tg1K/weight2/tg2K' } })
          }
          request.weight1 = args.weight1
          request.tg1K = args.tg1K
          request.weight2 = args.weight2
          request.tg2K = args.tg2K
          if (args.kConstant !== undefined) request.kConstant = args.kConstant
        }
        return simulate('pm_sim_tg_blend', 'tg_blend', args, request, exec, engine, result => {
          const tg = result.TgBlendK ?? result.TgK
          return `glass transition: Tg=${String(tg)} K (${String(result.part ?? args.part)})`
        }, resolvePreset)
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_sim_diffusion',
      description: '小分子输运：Arrhenius 拟合（Ea、D₀）或 Vrentas-Duda 自由体积 D₁，登记仿真证据',
      parameters: {
        projectId: { type: 'string', required: true },
        part: { type: 'string', enum: ['arrhenius', 'vrentas-duda'], required: true },
        dataPath: { type: 'string' },
        temperatureColumn: { type: 'string' },
        diffusivityColumn: { type: 'string' },
        d0: { type: 'number' },
        activationJPerMol: { type: 'number' },
        omega1: { type: 'number' },
        v1Star: { type: 'number' },
        k11: { type: 'number' },
        k21K: { type: 'number' },
        tg1K: { type: 'number' },
        k12: { type: 'number' },
        k22K: { type: 'number' },
        tg2K: { type: 'number' },
        gamma: { type: 'number' },
        ...commonParameters(),
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: SimArgs & {
        part: 'arrhenius' | 'vrentas-duda'
        dataPath?: string
        temperatureColumn?: string
        diffusivityColumn?: string
        d0?: number
        activationJPerMol?: number
        omega1?: number
        v1Star?: number
        k11?: number
        k21K?: number
        tg1K?: number
        k12?: number
        k22K?: number
        tg2K?: number
        gamma?: number
      }, exec) {
        if (args.part === 'arrhenius') {
          if (args.dataPath === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'arrhenius needs dataPath (temperature, diffusivity columns)' } })
          }
          return simulateFromCsv('pm_sim_diffusion', 'diffusion', args, series => ({
            temperature_k: series.x,
            diffusivity: series.y,
          }), exec, engine, result => `Arrhenius Ea=${String(result.EaKJPerMol)} kJ/mol, D0=${String(result.D0)} m²/s`, resolvePreset)
        }
        for (const key of ['d0', 'omega1', 'v1Star', 'k11', 'k21K', 'tg1K', 'k12', 'k22K', 'tg2K'] as const) {
          if (args[key] === undefined) {
            return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: `vrentas-duda needs ${key}` } })
          }
        }
        const snake: Record<string, string> = {
          activationJPerMol: 'activation_j_per_mol',
          v1Star: 'v1_star',
          k21K: 'k21_k',
          tg1K: 'tg1_k',
          k22K: 'k22_k',
          tg2K: 'tg2_k',
        }
        const request: Record<string, unknown> = {}
        for (const key of ['d0', 'activationJPerMol', 'omega1', 'v1Star', 'k11', 'k21K', 'tg1K', 'k12', 'k22K', 'tg2K'] as const) {
          if (args[key] !== undefined) request[snake[key] ?? key] = args[key]
        }
        if (args.gamma !== undefined) request.gamma = args.gamma
        return simulate('pm_sim_diffusion', 'diffusion', args, request, exec, engine, result => {
          return `Vrentas-Duda D1=${String(result.D1).toExponential(3)} m²/s at free volume ${String(result.freeVolumeOverGamma)} cm³/g`
        }, resolvePreset)
      },
    }))
  })
}
