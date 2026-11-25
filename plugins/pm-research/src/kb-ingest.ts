/** Cross-plugin bridge: hand one file to dsh-kb-rag's kb_ingest tool. */

import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

type AnyTool = Record<string, unknown>

export interface KbIngestOutcome {
  readonly ok: boolean
  readonly result?: unknown
  readonly skipped?: string
  readonly error?: string
}

/**
 * Index one downloaded file. A missing KB plugin is a skip, not a download
 * failure: the PDF stays on disk and the literature tool still succeeds.
 */
export async function ingestKnowledgeBase(
  scope: Context,
  exec: ToolRunContext,
  filePath: string,
): Promise<KbIngestOutcome> {
  if (filePath.length === 0) return { ok: false, skipped: 'no file path' }
  const registry = scope.tools as unknown as { get?: (name: string) => AnyTool | undefined }
  const tool = registry.get?.('kb_ingest')
  if (tool === undefined) return { ok: false, skipped: 'dsh-kb-rag is not installed' }
  const run = tool['execute']
  if (typeof run !== 'function') return { ok: false, skipped: 'kb_ingest has no runner' }
  try {
    const result = await Reflect.apply(run, tool, [{ paths: [filePath] }, exec])
    return { ok: true, result }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}
