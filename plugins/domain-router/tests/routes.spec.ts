import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { registerDomainRoutes } from '../src/routes.ts'
import type { DomainRouterOptions } from '../src/tools.ts'

const roots: string[] = []

interface RegisteredRoute {
  readonly path: string
  readonly fetch: (request: Request) => Promise<Response>
}

async function fixture(): Promise<{ root: string; workspace: string; home: string; options: DomainRouterOptions; routes: RegisteredRoute[] }> {
  const root = await mkdtemp(join(tmpdir(), 'domain-routes-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const home = join(root, 'home')
  await mkdir(join(workspace, 'domains', 'pva'), { recursive: true })
  await mkdir(join(workspace, '.kb-papers'), { recursive: true })
  await mkdir(join(workspace, '.kb-notes'), { recursive: true })
  await mkdir(join(home, 'pm', 'projects', 'PR-1'), { recursive: true })
  await writeFile(join(workspace, 'domains', 'pva', 'domain.json'), JSON.stringify({
    id: 'pva',
    name: 'PVA 光学膜',
    kbRoot: '.kb-papers',
    notesRoot: '.kb-notes',
    allowedKinds: ['pdf'],
    defaultKind: 'pdf',
  }), 'utf8')
  await writeFile(join(home, 'pm', 'projects', 'PR-1', 'project.json'), JSON.stringify({
    id: 'PR-1',
    title: 'PVA 项目',
    domain: 'pva',
  }), 'utf8')
  const routes: RegisteredRoute[] = []
  const options: DomainRouterOptions = {
    homeDir: home,
    expertPresets: new Set(),
    workspaceRegistry: {
      resolveByPath: async path => path === workspace ? { id: 'workspace-1', path: workspace } : undefined,
    },
  }
  return { root, workspace, home, options, routes }
}

function createDb(root: string, schema: 'v5' | 'legacy'): void {
  const db = new DatabaseSync(join(root, 'kb.sqlite'))
  if (schema === 'v5') {
    db.exec(`
      CREATE TABLE docs (
        id INTEGER PRIMARY KEY,
        title TEXT,
        year INTEGER,
        doi TEXT,
        kind TEXT NOT NULL,
        domain TEXT,
        path TEXT NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE chunks (id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL);
      CREATE TABLE vecs (id INTEGER PRIMARY KEY, chunk_id INTEGER NOT NULL);
    `)
    const insert = db.prepare('INSERT INTO docs (id, title, year, doi, kind, domain, path, chunk_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    insert.run(1, 'PVA paper', 2025, '10.1000/pva', 'pdf', 'pva', join(root, 'papers', 'pva.pdf'), 3)
    insert.run(2, 'PVA report', 2024, null, 'md', 'pva', join(root, 'reports', 'report.md'), 1)
    insert.run(3, 'Other domain', 2023, null, 'pdf', 'waxs', join(root, 'papers', 'other.pdf'), 2)
  } else {
    db.exec('CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, year INTEGER, doi TEXT, kind TEXT, path TEXT, chunk_count INTEGER)')
  }
  db.close()
}

function register(options: DomainRouterOptions, routes: RegisteredRoute[]): () => Promise<void> {
  return registerDomainRoutes({
    fetch: {
      register(route) {
        routes.push(route)
        return async () => {}
      },
    },
  }, options)
}

function route(routes: RegisteredRoute[], path: string): RegisteredRoute {
  const found = routes.find(item => item.path === path)
  if (found === undefined) throw new Error(`missing route ${path}`)
  return found
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('domain routes', () => {
  it('rejects existing but unregistered workspace paths', async () => {
    const { root, options, routes } = await fixture()
    register(options, routes)
    const response = await route(routes, '/api/pm-domain/domains').fetch(new Request(
      `http://dsh.test/api/pm-domain/domains?workspace=${encodeURIComponent(root)}`,
    ))
    expect(response.status).toBe(400)
    expect(await json(response)).toMatchObject({ ok: false, error: { code: 'WORKSPACE_REQUIRED' } })
  })

  it('returns only registered workspace ids and workspace-relative document paths', async () => {
    const { workspace, options, routes } = await fixture()
    createDb(join(workspace, '.kb-papers'), 'v5')
    register(options, routes)
    const response = await route(routes, '/api/pm-domain/literature').fetch(new Request(
      `http://dsh.test/api/pm-domain/literature?workspace=${encodeURIComponent(workspace)}&domain=pva&kind=pdf`,
    ))
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.workspace).toBe('workspace-1')
    expect(JSON.stringify(body)).not.toContain(workspace)
    expect((body.domain as Record<string, unknown>).kbRoot).toBe('.kb-papers')
    expect((body.papers as Record<string, unknown>).docs).toEqual([
      expect.objectContaining({ title: 'PVA paper', path: '.kb-papers/papers/pva.pdf', kind: 'pdf' }),
    ])
  })

  it('rejects project/domain mismatch and disallowed kinds before reading KB data', async () => {
    const { workspace, home, options, routes } = await fixture()
    await mkdir(join(home, 'pm', 'projects', 'PR-waxs'), { recursive: true })
    await writeFile(join(home, 'pm', 'projects', 'PR-waxs', 'project.json'), JSON.stringify({
      id: 'PR-waxs', title: 'WAXS 项目', domain: 'waxs',
    }), 'utf8')
    createDb(join(workspace, '.kb-papers'), 'v5')
    register(options, routes)
    const active = await route(routes, '/api/pm-domain/active').fetch(new Request(
      'http://dsh.test/api/pm-domain/active',
      {
        method: 'POST',
        body: JSON.stringify({ workspace, domain: 'pva', projectId: 'PR-waxs' }),
        headers: { 'content-type': 'application/json' },
      },
    ))
    expect(active.status).toBe(404)
    expect(await json(active)).toMatchObject({ ok: false, error: { code: 'PROJECT_DOMAIN_MISMATCH' } })
    const literature = await route(routes, '/api/pm-domain/literature').fetch(new Request(
      `http://dsh.test/api/pm-domain/literature?workspace=${encodeURIComponent(workspace)}&domain=pva&kind=txt`,
    ))
    expect(literature.status).toBe(400)
    expect(await json(literature)).toMatchObject({ ok: false, error: { code: 'KIND_NOT_ALLOWED' } })
  })

  it('keeps reports and notes visible with the migrated PDF-only paper policy', async () => {
    const { workspace, options, routes } = await fixture()
    createDb(join(workspace, '.kb-papers'), 'v5')
    const notesRoot = join(workspace, '.kb-notes')
    createDb(notesRoot, 'v5')
    const db = new DatabaseSync(join(notesRoot, 'kb.sqlite'))
    const insert = db.prepare('INSERT INTO docs (id, title, kind, domain, path) VALUES (?, ?, ?, ?, ?)')
    insert.run(4, 'PVA note', 'txt', 'pva', join(notesRoot, 'note.txt'))
    insert.run(5, 'Other domain note', 'txt', 'waxs', join(notesRoot, 'other.txt'))
    db.close()
    register(options, routes)
    const response = await route(routes, '/api/pm-domain/literature').fetch(new Request(
      `http://dsh.test/api/pm-domain/literature?workspace=${encodeURIComponent(workspace)}&domain=pva&kind=all`,
    ))
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({
      papers: { total: 1, docs: [expect.objectContaining({ title: 'PVA paper' })] },
      notes: { total: 2, docs: [expect.objectContaining({ title: 'PVA report' }), expect.objectContaining({ title: 'PVA note' })] },
    })
  })

  it('fails closed when the domain column is absent', async () => {
    const { workspace, options, routes } = await fixture()
    createDb(join(workspace, '.kb-papers'), 'legacy')
    register(options, routes)
    const response = await route(routes, '/api/pm-domain/literature').fetch(new Request(
      `http://dsh.test/api/pm-domain/literature?workspace=${encodeURIComponent(workspace)}&domain=pva`,
    ))
    expect(response.status).toBe(409)
    expect(await json(response)).toMatchObject({ ok: false, error: { code: 'DOMAIN_SCHEMA_REQUIRED' } })
  })
})
