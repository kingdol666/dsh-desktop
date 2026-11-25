/** Literature retrieval tools: OpenAlex/Crossref search, polymer screening and
 * OA-chain PDF download with manifest. Python bridge via the science CLI. */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { actingPreset, canUseTool, type PresetResolver } from './permissions.ts'
import { ingestKnowledgeBase } from './kb-ingest.ts'
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
          const kbIngest = await ingestKnowledgeBase(scope, exec, typeof result.path === 'string' ? result.path : '')
          return toToolJson({ ok: true, data: { ...result, kbIngest } })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_literature_browser_download',
      description: '真浏览器（Chromium/CDP）取 PDF：下载阶梯的最后一跳，用于 OA 链取不到、但机构订阅能看的文献。做法是起一个真实浏览器直连校园网（--no-proxy-server）、渲染落地页、复用会话取字节；不破解验证 —— Cloudflare/Anubis 这类真浏览器能自然通过的校验会自己通过，遇到人机验证或站点低置信判定则返回 MANUAL_REQUIRED 并附 DOI 直链交给人。状态分类 DOWNLOADED / MANUAL_REQUIRED / CLOUDFLARE_CHALLENGE / BROWSER_UNAVAILABLE；落盘后同样追加 manifest.jsonl 台账',
      parameters: {
        doi: { type: 'string' },
        url: { type: 'string' },
        targetPath: { type: 'string' },
        filename: { type: 'string' },
        port: { type: 'integer' },
        profileDir: { type: 'string' },
        chromePath: { type: 'string' },
        timeoutMs: { type: 'integer' },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        doi?: string
        url?: string
        targetPath?: string
        filename?: string
        port?: number
        profileDir?: string
        chromePath?: string
        timeoutMs?: number
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_literature_browser_download', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        if ((args.doi ?? '').trim().length === 0 && (args.url ?? '').trim().length === 0) {
          return toToolJson({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'doi or url is required' } })
        }
        try {
          const root = sessionWorkspace(exec.agent)
          const target = args.targetPath === undefined
            ? resolveDataPath('literature', root)
            : resolveDataPath(args.targetPath, root)
          const result = await runScience('literature_browser_download', {
            ...(args.doi === undefined ? {} : { doi: args.doi }),
            ...(args.url === undefined ? {} : { url: args.url }),
            ...(args.filename === undefined ? {} : { filename: args.filename }),
            ...(args.port === undefined ? {} : { port: args.port }),
            ...(args.profileDir === undefined ? {} : { profileDir: args.profileDir }),
            ...(args.chromePath === undefined ? {} : { chromePath: args.chromePath }),
            ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
            targetDir: target,
          }, { signal: exec.signal })
          if (result.ok === false && !isStatusOutcome(result)) return toToolJson(dataFailure(result))
          const kbIngest = await ingestKnowledgeBase(scope, exec, typeof result.path === 'string' ? result.path : '')
          return toToolJson({ ok: true, data: { ...result, kbIngest } })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))

    scope.tools.register(defineTool({
      name: 'pm_kb_note',
      description: '把用户指定的一段正文手工存入文献知识库：写入 workspace/literature/notes/<时间>-<标题>.txt，再调用 dsh-kb-rag 的 kb_ingest 建立全文索引；随后 kb_search / kb_rag 可立即检索和引用。用于“把这段结论/参数/摘要存进知识库”这类明确指令',
      parameters: {
        text: { type: 'string', required: true },
        title: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        preset: { type: 'string' },
        actor: { type: 'string' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render },
      async execute(args: {
        text: string
        title?: string
        tags?: string[]
        preset?: string
        actor?: string
      }, exec) {
        const auth = authorize('pm_kb_note', args, exec, resolvePreset)
        if (!auth.ok) return toToolJson(auth)
        try {
          const root = sessionWorkspace(exec.agent)
          const directory = resolveDataPath('literature/notes', root)
          await mkdir(directory, { recursive: true })
          const title = (args.title ?? args.text.slice(0, 32)).trim() || 'untitled'
          const slug = title.replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'note'
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          // kb-rag's Markdown chunker returns 0 chunks for a plain heading+body
          // note; TXT chunks reliably and stays human-readable.
          const filePath = join(directory, `${stamp}-${slug}.txt`)
          const tags = (args.tags ?? []).map(tag => String(tag))
          const header = tags.length === 0 ? '' : `tags: ${tags.join(', ')}\n\n`
          await writeFile(filePath, `${title}\n\n${header}${args.text}\n`, 'utf8')
          const kbIngest = await ingestKnowledgeBase(scope, exec, filePath)
          return toToolJson({ ok: true, data: { path: filePath, title, tags, kbIngest } })
        } catch (cause) {
          return toToolJson(failure(cause))
        }
      },
    }))
  })
}
