import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { domainCounts, domainSchemaState, listDocs } from '../src/kb.ts'
import type { DomainConfig } from '../src/types.ts'

const roots: string[] = []

const domain: DomainConfig = {
  schemaVersion: 1,
  id: 'pva',
  name: 'PVA',
  description: '',
  keywords: [],
  kbRoot: '',
  allowedKinds: ['pdf', 'md'],
  defaultKind: 'pdf',
  relatedDomains: [],
  priority: 0,
}

function createDb(root: string): void {
  const db = new DatabaseSync(join(root, 'kb.sqlite'))
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
  const insertDoc = db.prepare('INSERT INTO docs (id, title, year, doi, kind, domain, path, chunk_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  insertDoc.run(1, 'PVA paper', 2025, '10.1000/pva', 'pdf', 'pva', join(root, 'pva.pdf'), 2)
  insertDoc.run(2, 'PVA notes', 2024, null, 'md', 'pva', join(root, 'notes.md'), 1)
  insertDoc.run(3, 'WAXS paper', 2023, null, 'pdf', 'waxs', join(root, 'waxs.pdf'), 5)
  const insertChunk = db.prepare('INSERT INTO chunks (id, doc_id) VALUES (?, ?)')
  insertChunk.run(1, 1)
  insertChunk.run(2, 1)
  insertChunk.run(3, 2)
  insertChunk.run(4, 3)
  const insertVector = db.prepare('INSERT INTO vecs (id, chunk_id) VALUES (?, ?)')
  insertVector.run(1, 1)
  insertVector.run(2, 3)
  insertVector.run(3, 4)
  db.close()
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('domain KB queries', () => {
  it('filters by domain and kind, paginates, and counts vectors through documents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'domain-kb-'))
    roots.push(root)
    await mkdir(root, { recursive: true })
    createDb(root)
    expect(domainSchemaState(root)).toBe('ready')
    expect(listDocs(root, { domain: 'pva', kind: 'pdf' })).toMatchObject({
      total: 1,
      domainColumn: true,
      docs: [expect.objectContaining({ title: 'PVA paper', kind: 'pdf', chunks: 2 })],
    })
    expect(listDocs(root, { domain: 'pva', kinds: ['pdf', 'md'], limit: 1, offset: 1 })).toMatchObject({
      total: 2,
      docs: [expect.objectContaining({ title: 'PVA notes', kind: 'md' })],
    })
    expect(domainCounts({ ...domain, kbRoot: root })).toEqual({
      papers: 1,
      reports: 1,
      notes: 0,
      chunks: 3,
      vectors: 2,
    })
  })

  it('fails closed for domain filters on legacy schemas', async () => {
    const root = await mkdtemp(join(tmpdir(), 'domain-kb-legacy-'))
    roots.push(root)
    const db = new DatabaseSync(join(root, 'kb.sqlite'))
    db.exec('CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, year INTEGER, doi TEXT, kind TEXT, path TEXT, chunk_count INTEGER)')
    db.close()
    expect(domainSchemaState(root)).toBe('legacy')
    expect(listDocs(root, { domain: 'pva' })).toMatchObject({ total: 0, docs: [], domainColumn: false })
  })
})
