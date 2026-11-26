import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-tools', () => ({
  defineTool: (options: unknown) => options,
}))

import { registerDomainTools } from '../src/tools.ts'
import { readState } from '../src/state.ts'

const roots: string[] = []

interface FakeTool {
  execute(args: unknown, exec: unknown): Promise<unknown>
}

function parse(value: unknown): Record<string, unknown> {
  return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('domain tools', () => {
  it('routes, scopes, remembers with enforced tags, and requires cross-domain confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'domain-tools-'))
    roots.push(root)
    const workspace = join(root, 'ws')
    const home = join(root, 'home')
    await mkdir(join(workspace, 'domains', 'pva'), { recursive: true })
    await mkdir(join(workspace, 'domains', 'waxs'), { recursive: true })
    await mkdir(join(home, 'pm', 'projects', 'PR-1'), { recursive: true })
    await writeFile(join(workspace, 'domains', 'pva', 'domain.json'), JSON.stringify({
      id: 'pva',
      name: 'PVA 光学膜',
      kbRoot: '.kb-papers',
      notesRoot: '.kb-notes',
      keywords: ['PVA', '双轴拉伸'],
      relatedDomains: ['waxs'],
    }), 'utf8')
    await writeFile(join(workspace, 'domains', 'waxs', 'domain.json'), JSON.stringify({
      id: 'waxs',
      name: 'WAXS 方法',
      kbRoot: '.kb-papers',
      keywords: ['GIWAXS'],
    }), 'utf8')
    await writeFile(join(home, 'pm', 'projects', 'PR-1', 'project.json'), JSON.stringify({
      id: 'PR-1', title: 'PVA 项目', domain: 'pva',
    }), 'utf8')

    const registered = new Map<string, FakeTool>()
    let remembered: Record<string, unknown> | undefined
    const recalls: Array<Record<string, unknown>> = []
    const fakeTools = {
      register(tool: FakeTool) {
        registered.set((tool as unknown as { name: string }).name, tool)
        return () => {}
      },
      get(name: string): FakeTool | undefined {
        if (name === 'cognition_remember') {
          return { execute: async (args) => { remembered = args as Record<string, unknown>; return JSON.stringify({ stored: { id: 'mem-1' }, conflicts: [{ content: 'unrelated fact' }] }) } }
        }
        if (name === 'cognition_recall') {
          return { execute: async (args) => { recalls.push(args as Record<string, unknown>); return JSON.stringify({ hits: [{ content: 'rule' }] }) } }
        }
        return undefined
      },
    }
    const fakeCtx = {
      inject(_names: string[], mount: (scope: { tools: typeof fakeTools }) => void) { mount({ tools: fakeTools }) },
      effect(fn: () => void) { fn() },
    } as unknown as Context
    registerDomainTools(fakeCtx, {
      homeDir: home,
      expertPresets: new Set(),
      workspaceRegistry: {
        resolveByPath: async path => path === workspace ? { id: 'workspace-1', path: workspace } : undefined,
      },
    })
    expect([...registered.keys()].sort()).toEqual([
      'domain_list', 'domain_recall', 'domain_remember', 'domain_route', 'domain_scope',
    ])

    const exec = {
      agent: { session: { header: { cwd: workspace, agentPreset: 'polymer-scientist' } } },
      signal: new AbortController().signal,
    } as unknown as ToolRunContext
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = registered.get(name)
      if (tool === undefined) throw new Error(`missing ${name}`)
      return parse(await tool.execute(args, exec))
    }

    const routed = await call('domain_route', { question: 'PVA 双轴拉伸后的取向' })
    expect(routed.domain).toBe('pva')
    expect(routed.needsConfirmation).toBe(false)

    const scoped = await call('domain_scope', { domain: 'pva', projectId: 'PR-1' })
    expect(scoped.ok).toBe(true)
    expect((await readState(workspace))?.projectId).toBe('PR-1')

    const stored = await call('domain_remember', { text: 'PVA 报告必须带不确定度' })
    expect(stored).toMatchObject({ ok: true, result: { stored: { id: 'mem-1' } } })
    expect(stored.result).not.toHaveProperty('conflicts')
    expect(remembered?.scope).toBe('workspace')
    expect(remembered?.workspaceId).toBeTypeOf('string')
    const tags = remembered?.tags as string[]
    expect(tags).toContain('project:PR-1')
    expect(tags).toContain('domain:pva')
    expect(tags.some(tag => tag.startsWith('workspace:'))).toBe(true)

    const refused = await call('domain_recall', { query: '不确定度', crossDomain: true })
    expect((refused.error as Record<string, unknown>)?.code).toBe('CROSS_DOMAIN_CONFIRMATION_REQUIRED')

    const recalled = await call('domain_recall', { query: '不确定度', crossDomain: true, confirmCrossDomain: true })
    expect(recalled.ok).toBe(true)
    expect(recalls).toHaveLength(2)
    expect((recalled.hits as Array<Record<string, unknown>>).every(hit => typeof hit.domain === 'string')).toBe(true)

    const badProject = await call('domain_route', { question: 'PVA', projectId: 'PR-404' })
    expect((badProject.error as Record<string, unknown>)?.code).toBe('PROJECT_NOT_FOUND')

    const projectMismatch = await call('domain_route', { question: 'GIWAXS', projectId: 'PR-1' })
    expect((projectMismatch.error as Record<string, unknown>)?.code).toBe('PROJECT_DOMAIN_MISMATCH')

    await call('domain_scope', { domain: 'pva' })
    const noProjectRecall = await call('domain_recall', { query: '不确定度' })
    expect((noProjectRecall.error as Record<string, unknown>)?.code).toBe('PROJECT_REQUIRED')

    const unregisteredExec = {
      agent: { session: { header: { cwd: join(root, 'unregistered') } } },
      signal: new AbortController().signal,
    } as unknown as ToolRunContext
    const list = registered.get('domain_list')
    if (list === undefined) throw new Error('missing domain_list')
    await expect(list.execute({}, unregisteredExec)).rejects.toThrow('registered session workspace')

    const badDomain = await call('domain_scope', { domain: 'missing' })
    expect((badDomain.error as Record<string, unknown>)?.code).toBe('DOMAIN_NOT_FOUND')
  })
})
