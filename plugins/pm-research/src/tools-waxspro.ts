/** WAXS pro pipeline and human-readable HTML/MD reporting tools. */

import { mkdir } from 'node:fs/promises'
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
interface ProArgs {
  readonly projectId?: string
  readonly preset?: string
  readonly actor?: string
  readonly claimSupport?: string
  readonly polarity?: 'supports' | 'refutes' | 'neutral'
  readonly strength?: 'strong' | 'moderate' | 'weak'
  readonly record?: boolean
}

/** Authorize or return the denial envelope. */
function authorize(
  tool: string,
  args: Pick<ProArgs, 'preset' | 'actor'>,
  exec: ToolRunContext,
  resolve?: PresetResolver,
): { ok: true; preset: string; actor: string } | { ok: false; error: Record<string, unknown> } {
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

const STRENGTH = { type: 'string', enum: ['strong', 'moderate', 'weak'] } as const
const POLARITY = { type: 'string', enum: ['supports', 'refutes', 'neutral'] } as const

function commonParameters(): Record<string, unknown> {
  return {
    projectId: { type: 'string' },
    claimSupport: { type: 'string' },
    polarity: POLARITY,
    strength: STRENGTH,
    record: { type: 'boolean' },
    preset: { type: 'string' },
    actor: { type: 'string' },
  }
}

/** Register the WAXS pro pipeline tools. */
export function registerWaxsProTools(ctx: Context, engine: PmResearchEngine, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_waxs_pro',
      description: [
        'WAXS 进阶管线（实验室 MATLAB 脚本移植）：',
        'op=airremove 扣空气背底（k 系数法，样品+本底两列 CSV 或两文件）；',
        'op=peakfit 多峰 Gauss 面积拟合（峰角色 crystalline/amorphous，输出结晶度/FWHM/d 间距/Scherrer 尺寸/拟合曲线）；',
        'op=orientation 方位角 Hermans 取向度（Lorentzian 拟合 + 挡板/探测器间隙掩膜，输出 f_hkl/f_chain/cos²）。',
        '结果可登记证据。',
      ].join(''),
      parameters: {
        ...commonParameters(),
        projectId: { type: 'string', description: '登记证据的项目 ID（缺省则只做分析不登记）' },
        op: { type: 'string', enum: ['airremove', 'peakfit', 'orientation'], required: true },
        dataPath: { type: 'string', required: true, description: '样品 CSV（airremove 可为 sample 列所在文件）' },
        xColumn: { type: 'string' },
        yColumn: { type: 'string' },
        airPath: { type: 'string', description: 'airremove/orientation 的本底 CSV' },
        airColumn: { type: 'string' },
        edgePoints: { type: 'number', description: 'airremove k 估计的前 N 点均值（默认 10）' },
        window: { type: 'array', items: { type: 'number' }, description: 'airremove 的 2θ 窗口 [low, high]' },
        peaks: {
          type: 'array',
          description: 'peakfit 峰规格：[{center, width, role: crystalline|amorphous, centerBounds?, widthBounds?, areaBounds?}]',
          items: { type: 'object', additionalProperties: true },
        },
        fitRange: { type: 'array', items: { type: 'number' }, description: '[low, high]，peakfit/orientation 的拟合窗口' },
        wavelengthAngstrom: { type: 'number', description: '波长（默认 1.5418 Cu Kα；同步辐射按实际填）' },
        twoThetaPeak: { type: 'number', description: 'orientation：所取晶面的 2θ' },
        gapMasks: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'orientation：方位角剔除窗口 [[a,b],…]' },
        k: { type: 'number', description: 'orientation：沿用 airremove 输出的 k' },
        legacyBaselineSquare: { type: 'boolean', description: '复现 MATLAB 原积分 d² 行为（默认 false=修正版）' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: ProArgs & {
        op: 'airremove' | 'peakfit' | 'orientation'
        dataPath: string
        xColumn?: string
        yColumn?: string
        airPath?: string
        airColumn?: string
        edgePoints?: number
        window?: number[]
        peaks?: Array<Record<string, unknown>>
        fitRange?: number[]
        wavelengthAngstrom?: number
        twoThetaPeak?: number
        gapMasks?: number[][]
        k?: number
        legacyBaselineSquare?: boolean
      }, exec) {
        const auth = authorize('pm_waxs_pro', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const root = sessionWorkspace(exec.agent)
          const path = resolveDataPath(args.dataPath, root)
          const sample = await readCsvSeries(path, {
            ...(args.xColumn === undefined ? {} : { x: args.xColumn }),
            ...(args.yColumn === undefined ? {} : { y: args.yColumn }),
          })
          let air: Awaited<ReturnType<typeof readCsvSeries>> | undefined
          if (args.airPath !== undefined) {
            air = await readCsvSeries(resolveDataPath(args.airPath, root), {
              ...(args.xColumn === undefined ? {} : { x: args.xColumn }),
              ...(args.airColumn === undefined ? {} : { y: args.airColumn }),
            })
          }
          const op = args.op
          const request: Record<string, unknown> = { op }
          if (op === 'airremove') {
            if (air === undefined) {
              return toToolJson({ ok: false, error: { code: 'INVALID_ARGS', message: 'airremove requires airPath' } })
            }
            request.twoTheta = sample.x
            request.sample = sample.y
            request.air = air.y
            if (args.edgePoints !== undefined) request.edgePoints = args.edgePoints
            if (args.window !== undefined) request.window = args.window
          } else if (op === 'peakfit') {
            request.twoTheta = sample.x
            request.intensity = sample.y
            if (args.peaks !== undefined) request.peaks = args.peaks
            if (args.fitRange !== undefined) request.fitRange = args.fitRange
            if (args.wavelengthAngstrom !== undefined) request.wavelengthAngstrom = args.wavelengthAngstrom
          } else {
            if (args.twoThetaPeak === undefined) {
              return toToolJson({ ok: false, error: { code: 'INVALID_ARGS', message: 'orientation requires twoThetaPeak' } })
            }
            request.azimuth = sample.x
            request.intensity = sample.y
            request.twoThetaPeak = args.twoThetaPeak
            if (air !== undefined) {
              request.air = air.y
              request.k = args.k ?? 1.0
            }
            if (args.gapMasks !== undefined) request.gapMasks = args.gapMasks
            if (args.fitRange !== undefined) request.fitRange = args.fitRange
            if (args.wavelengthAngstrom !== undefined) request.wavelengthAngstrom = args.wavelengthAngstrom
            if (args.legacyBaselineSquare === true) request.legacyBaselineSquare = true
          }
          const result = await runScience('waxs_pro' as ScienceTool, request, { signal: exec.signal })
          if (args.record === false || args.projectId === undefined) {
            return toToolJson({ ok: true, data: { analysis: result, evidence: null } })
          }
          const recorded = await engine.recordAnalysis(args.projectId, {
            tool: 'pm_waxs_pro',
            result,
            dataPath: path,
            claimSupport: args.claimSupport ?? `WAXS pro ${op}: ${JSON.stringify(result).slice(0, 160)}`,
            ...(args.polarity === undefined ? {} : { polarity: args.polarity }),
            ...(args.strength === undefined ? {} : { strength: args.strength }),
            recordedBy: auth.actor,
          })
          return toToolJson({
            ok: true,
            data: { analysis: result, evidence: recorded.evidence, artifactPath: recorded.artifactPath },
          })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_analysis_report',
      description: [
        '把分析结果渲染为人类可读的 HTML + Markdown 双报告（自包含单文件 HTML，含 KPI 卡片、内嵌 SVG 图表、表格、过程说明、结论与下一步）。',
        'payload 为结构化报告对象：{title, subtitle?, date?, kpis:[{label,value,unit?,note?}], sections:[{heading, narrative, table?, figure?}], conclusions:[…], nextSteps?[…], artifacts?:[{name,path}]}。',
        'figure.series 每项 {name, points:[[x,y],…], dash?}；输出写入 outputDir（相对工作区围栏）下的 <name>.md 与 <name>.html。',
        'WAXS/SAXS/FTIR 等任何分析完成后都应调用本工具生成面向人类的讲解报告。',
      ].join(''),
      parameters: {
        payloadPath: { type: 'string', description: '报告 payload 的 JSON 文件路径（与 payload 二选一）' },
        payload: { type: 'object', additionalProperties: true, description: '报告 payload 对象（与 payloadPath 二选一）' },
        outputDir: { type: 'string', required: true, description: '输出目录（工作区内相对路径或绝对路径，受围栏约束）' },
        name: { type: 'string', description: '报告文件名（不含扩展名，默认 report）' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        payloadPath?: string
        payload?: Record<string, unknown>
        outputDir: string
        name?: string
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_analysis_report', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const root = sessionWorkspace(exec.agent)
          let payload = args.payload
          if (payload === undefined) {
            if (args.payloadPath === undefined) {
              return toToolJson({ ok: false, error: { code: 'INVALID_ARGS', message: 'payload or payloadPath is required' } })
            }
            const { readFile } = await import('node:fs/promises')
            payload = JSON.parse(await readFile(resolveDataPath(args.payloadPath, root), 'utf8')) as Record<string, unknown>
          }
          const outDir = resolveDataPath(args.outputDir, root)
          await mkdir(outDir, { recursive: true })
          const result = await runScience('report' as ScienceTool, {
            payload,
            outputDir: outDir,
            name: args.name ?? 'report',
          }, { signal: exec.signal })
          return toToolJson({ ok: true, data: result })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))
  })
}
