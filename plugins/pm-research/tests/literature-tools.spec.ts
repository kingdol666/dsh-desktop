/** Literature tools: polymer rubric determinism, permissions, download path safety. */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { registerLiteratureTools } from '../src/tools-literature.ts'

interface RegisteredTool {
  readonly name: string
  execute(args: unknown, exec: unknown): Promise<unknown>
}

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-literature-tools-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function register(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>()
  const ctx = {
    inject: (_names: string[], callback: (scope: unknown) => void) => {
      callback({ tools: { register: (tool: RegisteredTool) => { tools.set(tool.name, tool); return () => {} } } })
    },
  } as unknown as Context
  registerLiteratureTools(ctx)
  return tools
}

function execFor(root: string, preset: string): unknown {
  return {
    agent: { session: { header: { cwd: root, agentPreset: preset } } },
    signal: new AbortController().signal,
  }
}

const POLYMER_PAPER = {
  doi: '10.1021/ma501634q',
  title: 'Biaxial stretching induced orientation and birefringence in PVA films',
  venue: 'Macromolecules',
  year: 2015,
  citedByCount: 48,
  oaStatus: 'closed',
  topics: ['Polymer science'],
}

describe('literature tool surface', () => {
  it('registers the three retrieval tools', () => {
    const tools = register()
    expect(tools.has('pm_literature_search')).toBe(true)
    expect(tools.has('pm_literature_screen')).toBe(true)
    expect(tools.has('pm_literature_download')).toBe(true)
  })

  it('denies a preset outside the permission matrix (denied-closed)', async () => {
    const tools = register()
    const root = await tempRoot()
    const result = await tools.get('pm_literature_screen')!.execute(
      { candidates: [POLYMER_PAPER] },
      execFor(root, 'polymer-reviewer'),
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  })

  it('denies an unattributed session (denied-closed)', async () => {
    const tools = register()
    const root = await tempRoot()
    const result = await tools.get('pm_literature_search')!.execute(
      { query: 'biaxial stretching PVA' },
      execFor(root, 'unknown-preset'),
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  })

  it('rejects an empty candidate list before reaching the engine', async () => {
    const tools = register()
    const root = await tempRoot()
    const result = await tools.get('pm_literature_screen')!.execute(
      { candidates: [] },
      execFor(root, 'polymer-literature'),
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } })
  })

  it('rejects a download target outside the workspace fence', async () => {
    const tools = register()
    const root = await tempRoot()
    const result = await tools.get('pm_literature_download')!.execute(
      { doi: '10.1021/ma501634q', targetPath: join(root, 'outside', '..', '..', 'escaped') },
      execFor(root, 'polymer-literature'),
    )
    expect(result).toMatchObject({ ok: false })
    const error = (result as { error?: { code?: string } }).error
    expect(String(error?.code ?? error?.message ?? '')).toMatch(/DATA_OUTSIDE_WORKSPACE|PATH|ESCAPE|resolve/i)
  })

  it('scores the polymer rubric deterministically through the real science bridge', async () => {
    const tools = register()
    const root = await tempRoot()
    const exec = execFor(root, 'polymer-literature')
    const first = await tools.get('pm_literature_screen')!.execute({ candidates: [POLYMER_PAPER] }, exec)
    const second = await tools.get('pm_literature_screen')!.execute({ candidates: [POLYMER_PAPER] }, exec)
    expect(first).toMatchObject({ ok: true })
    expect(second).toEqual(first)
    const data = (first as { data?: { candidates?: { screen?: { total?: number; grade?: string; breakdown?: Record<string, number> }[] } } }).data
    const screen = data?.candidates?.[0]?.screen
    expect(screen?.grade).toBe('core')
    expect(screen?.total ?? 0).toBeGreaterThanOrEqual(70)
    expect(screen?.breakdown?.venue).toBe(35)
    expect(screen?.breakdown?.topic).toBe(15)
    expect(screen?.breakdown?.availability).toBeGreaterThanOrEqual(6)
  })

  it('ranks a domain paper far above an off-domain paper', async () => {
    const tools = register()
    const root = await tempRoot()
    const offDomain = {
      doi: '10.1000/off-domain',
      title: 'A random note about inorganic catalysts',
      venue: 'Unknown Journal',
      year: 1998,
      citedByCount: 0,
      topics: [],
    }
    const result = await tools.get('pm_literature_screen')!.execute(
      { candidates: [POLYMER_PAPER, offDomain] },
      execFor(root, 'polymer-scientist'),
    )
    const candidates = (result as { data?: { candidates?: { doi?: string; screen?: { total?: number; grade?: string } }[] } }).data?.candidates ?? []
    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.doi).toBe(POLYMER_PAPER.doi)
    expect(candidates[0]?.screen?.grade).toBe('core')
    expect(candidates[1]?.screen?.grade).toBe('reference')
  })
})
