/** Literature closed loop E2E: live search → screen → download → local-PDF read
 * → claims → evidence ledger (hash chain) → knowledge card review.
 *
 * Network- and machine-dependent steps degrade to honest skips: the retrieval
 * and download chain needs internet; the kb-rag engine step needs the desktop
 * profile installed on this machine; the anchor PDF needs the acceptance
 * workspace. Everything else is the real engine and real science bridge. */

import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PmResearchEngine } from '../src/service.ts'
import { registerKnowledgeTools } from '../src/tools-knowledge.ts'
import { registerLiteratureTools } from '../src/tools-literature.ts'
import { registerScienceTools } from '../src/tools-science.ts'

interface RegisteredTool {
  execute(args: unknown, exec: unknown): Promise<unknown>
}

function registerAll(engine: PmResearchEngine): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerScienceTools(ctx, engine)
  registerLiteratureTools(ctx)
  registerKnowledgeTools(ctx, engine)
  return tools
}

function execFor(root: string, preset: string): unknown {
  return {
    agent: { session: { header: { cwd: root, agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

const KB_ENGINE = join(
  process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh'),
  'profiles', 'desktop', 'node_modules', 'dsh-kb-rag', 'kb_engine.py',
)
const SCIENCE_PYTHON = join(__dirname, '..', '..', '..', 'science', '.venv', 'Scripts', 'python.exe')

async function networkAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    await fetch('https://api.openalex.org/works?per-page=1', { signal: controller.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

describe('literature closed loop (live components)', () => {
  it('searches → screens → downloads → reads → extracts → verifies → consolidates knowledge',
    { timeout: 420_000 }, async () => {
      if (!(await networkAvailable())) {
        console.warn('SKIP: no network')
        return
      }
      const dir = await mkdtemp(join(tmpdir(), 'pm-lit-e2e-'))
      try {
        const engine = PmResearchEngine.open(dir)
        const tools = registerAll(engine)
        const project = await engine.createProject({
          title: 'PVA 取向-双折射文献闭环（E2E）',
          question: '拉伸比是否通过链取向主导 PVA 光学膜双折射',
          domain: 'pva-optical-film',
        }, 'human:pi')

        // 1) Live retrieval with the polymer rubric prescreen.
        const search = await tools.get('pm_literature_search')!.execute({
          query: 'biaxial stretching PVA optical film birefringence',
          maxResults: 10,
        }, execFor(dir, 'polymer-literature'))
        expect(search).toMatchObject({ ok: true })
        const candidates = (search as { data?: { candidates?: Array<Record<string, unknown>> } }).data?.candidates ?? []
        expect(candidates.length).toBeGreaterThanOrEqual(5)
        const top = candidates[0] as { screen?: { grade?: string }, doi?: string }
        expect(['core', 'important']).toContain(top.screen?.grade)

        // 2) Download chain: deterministic OA (arXiv DOI) + a paywalled probe
        //    whose status is recorded honestly (campus-dependent).
        const oaDownload = await tools.get('pm_literature_download')!.execute({
          doi: '10.48550/arXiv.1706.03762',
          targetPath: 'literature',
        }, execFor(dir, 'polymer-literature'))
        expect(oaDownload).toMatchObject({ ok: true })
        const oaData = (oaDownload as { data?: { status?: string; path?: string } }).data
        expect(oaData?.status).toBe('DOWNLOADED')
        expect(oaData?.path !== undefined && existsSync(oaData.path)).toBe(true)

        const paywalled = await tools.get('pm_literature_download')!.execute({
          doi: '10.1016/j.polymer.2015.02.045',
          targetPath: 'literature',
        }, execFor(dir, 'polymer-literature'))
        expect(paywalled).toMatchObject({ ok: true })
        const paywalledStatus = (paywalled as { data?: { status?: string } }).data?.status
        expect(['DOWNLOADED', 'OA_LINK_ONLY', 'CAMPUS_REQUIRED', 'CLOUDFLARE_CHALLENGE', 'MANUAL_REQUIRED'])
          .toContain(paywalledStatus)

        // 3) kb-rag engine ingest + search hit (desktop profile installed?).
        if (existsSync(KB_ENGINE) && existsSync(SCIENCE_PYTHON)) {
          const { spawnSync } = await import('node:child_process')
          const kbRoot = join(dir, 'kb')
          const ingest = spawnSync(SCIENCE_PYTHON, ['-I', KB_ENGINE, 'ingest'], {
            input: JSON.stringify({ kb_root: kbRoot, paths: [oaData?.path] }),
            encoding: 'utf8', timeout: 240_000,
          })
          expect(ingest.status).toBe(0)
          const kbSearch = spawnSync(SCIENCE_PYTHON, ['-I', KB_ENGINE, 'search'], {
            input: JSON.stringify({ kb_root: kbRoot, query: 'attention is all you need transformer', top_k: 3 }),
            encoding: 'utf8', timeout: 240_000,
          })
          expect(kbSearch.status).toBe(0)
          const lastLine = kbSearch.stdout.trim().split('\n').filter(line => line.trim()).at(-1) ?? '{}'
          const kbPayload = JSON.parse(lastLine)
          expect(kbPayload.results?.length ?? 0).toBeGreaterThan(0)
        } else {
          console.warn('SKIP kb step: kb-rag engine not found')
        }

        // 4) Read the anchor PVA paper and extract claims into the ledger.
        const anchorPdf = 'D:/pm-acceptance/pva-oblique-2026-11-20/papers/ursu-2015-pva-anisotropy.pdf'
        if (existsSync(anchorPdf)) {
          const workspacePdf = join(dir, 'papers', 'ursu-2015-pva-anisotropy.pdf')
          const { mkdir, copyFile } = await import('node:fs/promises')
          await mkdir(join(dir, 'papers'), { recursive: true })
          await copyFile(anchorPdf, workspacePdf)
          const read = await tools.get('pm_literature_read')!.execute(
            { path: workspacePdf, maxChars: 8_000 },
            execFor(dir, 'polymer-literature'))
          expect(read).toMatchObject({ ok: true })

          const extracted = await tools.get('pm_literature_extract')!.execute({
            projectId: project.id,
            sourceType: 'doi',
            sourceRef: '10.1016/j.optamate.2015.09.002',
            title: 'Ursu 2015 — PVA anisotropy',
            claims: [
              { claim: '室温测得: 未拉伸纯 PVA 膜双折射接近零（各向同性）', polarity: 'supports', strength: 'moderate' },
              { claim: '室温测得: 双折射随拉伸度单调上升', polarity: 'supports', strength: 'strong' },
              { claim: '室温测得: 染色 PVA 膜的应力光学行为与纯膜定性一致', polarity: 'neutral', strength: 'weak' },
            ],
          }, execFor(dir, 'polymer-literature'))
          expect(extracted).toMatchObject({ ok: true })
          const recorded = (extracted as { data?: { recorded?: unknown[] } }).data?.recorded ?? []
          expect(recorded.length).toBe(3)

          const verified = await engine.verifyEvidence(project.id)
          expect(verified.verified).toBe(true)

          // 5) Knowledge consolidation: propose (literature) → review (reviewer).
          const proposed = await tools.get('pm_knowledge_propose')!.execute({
            scope: 'project',
            kind: 'fact',
            title: 'PVA 膜双折射随拉伸度单调上升（文献）',
            body: 'Ursu 2015 实测: 纯 PVA 膜未拉伸时双折射≈0; 拉伸后单调上升。来源 DOI 10.1016/j.optamate.2015.09.002, 3 条证据已入账。',
          }, execFor(dir, 'polymer-literature'))
          expect(proposed).toMatchObject({ ok: true })
          const cardId = (proposed as { data?: { card?: { id?: string } } }).data?.card?.id
          expect(cardId).toBeTruthy()

          const review = await tools.get('pm_knowledge_review')!.execute({
            cardId,
            decision: 'approve',
            rationale: '证据链校验通过, 结论与测量一致',
          }, execFor(dir, 'polymer-reviewer'))
          expect(review).toMatchObject({ ok: true })
          const card = (review as { data?: { card?: { status?: string } } }).data?.card
          expect(card?.status).toBe('approved')
        } else {
          console.warn('SKIP anchor paper steps: acceptance workspace not found')
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
})
