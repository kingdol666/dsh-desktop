/** Literature retrieval tools: OpenAlex/Crossref search, polymer screening and
 * OA-chain PDF download with manifest. Python bridge via the science CLI. */

import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { renderJson as render, toToolJson } from './tool-json.ts'
import {
  resolveDataPath,
  runScience,
  ScienceFailure,
  ScienceUnavailable,
  sessionWorkspace,
} from './science.ts'

/** Shared optional authorization fields. */
interface LitArgs {
  readonly preset?: string
  readonly actor?: string
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
  args: Pick<LitArgs, 'preset' | 'actor'>,
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

/** Data-level failure (litsearch returns {ok:false,error} inside the envelope). */
function dataFailure(data: Record<string, unknown>): Record<string, unknown> {
  const error = data.error
  const message = typeof error === 'string'
    ? error
    : typeof (error as { message?: string } | undefined)?.message === 'string'
      ? (error as { message?: string }).message!
      : 'literature tool rejected the request'
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: string }).code === 'string'
    ? (error as { code: string }).code
    : 'INVALID_ARGUMENT'
  return { ok: false, error: { code, message } }
}

/** A status-classified outcome (DOWNLOADED/OA_LINK_ONLY/...) is not an error. */
function isStatusOutcome(data: Record<string, unknown>): boolean {
  return typeof data.status === 'string'
}

/**
 * Register the literature retrieval tools.
 * @param ctx - Host context providing `tools`.
 */
export function registerLiteratureTools(ctx: Context, resolvePreset?: PresetResolver): void {
  ctx.inject(['tools'], (scope) => {
    scope.tools.register(defineTool({
      name: 'pm_literature_search',
      description: '在线文献检索：OpenAlex 主源 + Crossref 辅源，可选年份窗；默认带高分子领域预筛（期刊层级/词库/topic/引用/新鲜度/可得性 rubric），按总分排序并给出分项理由',
      parameters: {
        query: { type: 'string', required: true },
        yearFrom: { type: 'integer' },
        yearTo: { type: 'integer' },
        maxResults: { type: 'integer' },
        sources: { type: 'array', items: { type: 'string', enum: ['openalex', 'crossref'] } },
        screen: { type: 'boolean' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        query: string
        yearFrom?: number
        yearTo?: number
        maxResults?: number
        sources?: ('openalex' | 'crossref')[]
        screen?: boolean
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_literature_search', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const result = await runScience('literature_search', {
            query: args.query,
            ...(args.yearFrom === undefined ? {} : { yearFrom: args.yearFrom }),
            ...(args.yearTo === undefined ? {} : { yearTo: args.yearTo }),
            ...(args.maxResults === undefined ? {} : { maxResults: args.maxResults }),
            ...(args.sources === undefined ? {} : { sources: args.sources }),
            ...(args.screen === undefined ? {} : { screen: args.screen }),
          }, { signal: exec.signal })
          if (result.ok === false) return toToolJson(dataFailure(result))
          return toToolJson({ ok: true, data: result })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_literature_screen',
      description: '高分子领域预筛评分（离线确定性）：输入候选列表（DOI/标题/期刊/年份/引用数/OA 状态），输出 0-100 rubric 总分（期刊层级 35/主题 40/质量 15/可得性 10）与判级 core≥70/important≥45/reference，附分项理由',
      parameters: {
        candidates: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              doi: { type: 'string' },
              title: { type: 'string' },
              venue: { type: 'string' },
              year: { type: 'integer' },
              citedByCount: { type: 'integer' },
              oaStatus: { type: 'string' },
              oaUrl: { type: 'string' },
              topics: { type: 'array', items: { type: 'string' } },
              abstract: { type: 'string' },
            },
          },
        },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        candidates: Record<string, unknown>[]
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_literature_screen', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        if (args.candidates.length === 0) {
          return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'candidates must not be empty' } })
        }
        try {
          const result = await runScience('literature_screen', { candidates: args.candidates }, { signal: exec.signal })
          if (result.ok === false) return toToolJson(dataFailure(result))
          return toToolJson({ ok: true, data: result })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_literature_download',
      description: '按 DOI 下载论文 PDF（机构 IP 合法访问，不绕过付费墙）：OA 链优先（arXiv → OpenAlex → Unpaywall → Crossref），落盘到 targetPath（workspace 围栏内，默认 literature/）并追加 literature-manifest.jsonl 台账；状态分类 DOWNLOADED / OA_LINK_ONLY / CAMPUS_REQUIRED / MANUAL_REQUIRED（附 DOI 直链，校园网内可浏览器直下）',
      parameters: {
        doi: { type: 'string', required: true },
        targetPath: { type: 'string' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        doi: string
        targetPath?: string
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_literature_download', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const root = sessionWorkspace(exec.agent)
          const target = args.targetPath === undefined
            ? resolveDataPath('literature', root)
            : resolveDataPath(args.targetPath, root)
          const result = await runScience('literature_download', {
            doi: args.doi,
            targetDir: target,
          }, { signal: exec.signal })
          if (result.ok === false && !isStatusOutcome(result)) return toToolJson(dataFailure(result))
          return toToolJson({ ok: true, data: result })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))
  })
}
