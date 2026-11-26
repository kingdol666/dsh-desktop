import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadRegistry, statePath } from '../src/registry.ts'
import { readState, writeState, workspaceId } from '../src/state.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'domain-router-'))
  roots.push(root)
  await mkdir(join(root, 'home'), { recursive: true })
  return root
}

async function domain(root: string, layer: 'domains' | 'home', id: string, body: Record<string, unknown>): Promise<void> {
  const dir = layer === 'domains' ? join(root, 'domains', id) : join(root, 'home', 'domains', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'domain.json'), JSON.stringify(body), 'utf8')
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('domain registry', () => {
  it('merges workspace over global and resolves relative roots', async () => {
    const root = await workspace()
    await domain(root, 'home', 'pva', { id: 'pva', name: 'Global PVA', kbRoot: '.kb-global', keywords: ['PVA'] })
    await domain(root, 'domains', 'pva', {
      id: 'pva',
      name: 'Workspace PVA',
      kbRoot: '.kb-papers',
      notesRoot: '.kb-notes',
      keywords: ['PVA', '双轴拉伸'],
      relatedDomains: ['waxs'],
      allowedKinds: ['pdf'],
      zoteroCollection: 'PVA',
      litProject: 'pva-optical-film',
    })
    await domain(root, 'domains', 'waxs', { id: 'waxs', name: 'WAXS', kbRoot: '.kb-papers', keywords: ['GIWAXS'] })
    const registry = await loadRegistry(root, join(root, 'home'))
    expect(registry.domains.map(item => item.id).sort()).toEqual(['pva', 'waxs'])
    const pva = registry.domains.find(item => item.id === 'pva')
    expect(pva?.name).toBe('Workspace PVA')
    expect(pva?.kbRoot).toBe(join(root, '.kb-papers'))
    expect(pva?.notesRoot).toBe(join(root, '.kb-notes'))
    expect(pva?.relatedDomains).toEqual(['waxs'])
    expect(pva?.zoteroCollection).toBe('PVA')
    expect(pva?.litProject).toBe('pva-optical-film')
    expect(registry.defaultDomain).toBe('pva')
  })

  it('falls back to a global domain and rejects path escapes', async () => {
    const root = await workspace()
    await domain(root, 'home', 'global', { id: 'global', name: 'Global', kbRoot: '.kb-global' })
    await domain(root, 'domains', 'evil', { id: 'evil', name: 'Evil', kbRoot: '../outside' })
    const registry = await loadRegistry(root, join(root, 'home'))
    expect(registry.domains.map(item => item.id)).toEqual(['global'])
    expect(registry.warnings.some(warning => warning.includes('kbRoot must stay inside'))).toBe(true)
  })

  it('rejects an existing symlinked KB root that resolves outside the workspace', async () => {
    const root = await workspace()
    const outside = await mkdtemp(join(tmpdir(), 'domain-router-outside-'))
    roots.push(outside)
    await symlink(outside, join(root, 'outside-link'), 'junction')
    await domain(root, 'domains', 'linked', { id: 'linked', name: 'Linked', kbRoot: 'outside-link' })
    const registry = await loadRegistry(root, join(root, 'home'))
    expect(registry.domains).toHaveLength(0)
    expect(registry.warnings.some(warning => warning.includes('kbRoot must stay inside'))).toBe(true)
  })
})

describe('domain state', () => {
  it('round-trips state atomically and keeps a stable workspace id', async () => {
    const root = await workspace()
    const state = { schemaVersion: 1 as const, domain: 'pva', projectId: 'PR-1', updatedAt: new Date().toISOString() }
    await writeState(root, state)
    expect(await readState(root)).toEqual(state)
    expect(workspaceId(root)).toMatch(/^[a-f0-9]{16}$/u)
    expect(workspaceId(root)).toBe(workspaceId(root))
    expect(statePath(root)).toBe(join(root, '.pm-domain', 'state.json'))
  })
})
