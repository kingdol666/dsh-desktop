/** Read-only SQLite access for the Literature page (papers + notes KBs). */

import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DomainConfig } from './types.ts'

/** One row rendered by the Literature page. */
export interface KbDoc {
  readonly id: number
  readonly title: string | null
  readonly year: number | null
  readonly doi: string | null
  readonly kind: string
  readonly domain: string | null
  readonly path: string
  readonly chunks: number
}

/** Counts by kind for one domain. */
export interface KbCounts {
  readonly papers: number
  readonly reports: number
  readonly notes: number
  readonly chunks: number
  readonly vectors: number
}

/** Query options for listing docs. */
export interface ListOptions {
  readonly domain?: string
  readonly kind?: string
  readonly kinds?: readonly string[]
  readonly limit?: number
  readonly offset?: number
}

const EMPTY_COUNTS: KbCounts = Object.freeze({ papers: 0, reports: 0, notes: 0, chunks: 0, vectors: 0 })

function open(root: string): DatabaseSync | undefined {
  const file = join(root, 'kb.sqlite')
  if (!existsSync(file)) return undefined
  try {
    return new DatabaseSync(file, { readOnly: true })
  } catch {
    return undefined
  }
}

function columns(db: DatabaseSync, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name?: unknown }>
    return new Set(rows.map(row => String(row.name ?? '')).filter(Boolean))
  } catch {
    return new Set()
  }
}

function hasTable(db: DatabaseSync, table: string): boolean {
  try {
    const row = db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table) as unknown as { name?: unknown } | undefined
    return row?.name === table
  } catch {
    return false
  }
}

function whereFor(columnsSet: Set<string>, options: ListOptions): { sql: string; args: Array<string | number> } {
  const clauses: string[] = []
  const args: Array<string | number> = []
  if (options.domain !== undefined && options.domain !== '') {
    if (!columnsSet.has('domain')) return { sql: ' WHERE 0', args }
    clauses.push('domain = ?')
    args.push(options.domain)
  }
  if (options.kinds !== undefined) {
    if (options.kinds.length === 0) return { sql: ' WHERE 0', args: [] }
    clauses.push(`kind IN (${options.kinds.map(() => '?').join(', ')})`)
    args.push(...options.kinds)
  } else if (options.kind !== undefined && options.kind !== '' && options.kind !== 'all') {
    clauses.push('kind = ?')
    args.push(options.kind)
  }
  return { sql: clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`, args }
}

export function domainSchemaState(root: string): 'missing' | 'ready' | 'legacy' {
  const file = join(root, 'kb.sqlite')
  if (!existsSync(file)) return 'missing'
  const db = open(root)
  if (db === undefined) return 'legacy'
  try {
    return columns(db, 'docs').has('domain') ? 'ready' : 'legacy'
  } finally {
    db.close()
  }
}

/** List documents from one KB directory. Missing DB returns an empty result. */
export function listDocs(root: string, options: ListOptions = {}): { docs: KbDoc[]; total: number; domainColumn: boolean } {
  const db = open(root)
  if (db === undefined) return { docs: [], total: 0, domainColumn: false }
  try {
    const columnsSet = columns(db, 'docs')
    if (columnsSet.size === 0) return { docs: [], total: 0, domainColumn: false }
    const hasDomain = columnsSet.has('domain')
    const where = whereFor(columnsSet, options)
    const total = Number((db.prepare(`SELECT count(*) AS n FROM docs${where.sql}`).get(...where.args) as unknown as { n?: unknown })?.n ?? 0)
    const limit = Math.max(1, Math.min(500, options.limit ?? 100))
    const offset = Math.max(0, options.offset ?? 0)
    const rows = db.prepare(
      `SELECT id, title, year, doi, kind, ${hasDomain ? 'domain' : 'NULL AS domain'}, path, chunk_count
       FROM docs${where.sql} ORDER BY year DESC, id DESC LIMIT ? OFFSET ?`,
    ).all(...where.args, limit, offset) as unknown as Array<Record<string, unknown>>
    return {
      total,
      domainColumn: hasDomain,
      docs: rows.map(row => ({
        id: Number(row.id ?? 0),
        title: typeof row.title === 'string' ? row.title : null,
        year: typeof row.year === 'number' ? row.year : null,
        doi: typeof row.doi === 'string' ? row.doi : null,
        kind: typeof row.kind === 'string' ? row.kind : 'unknown',
        domain: typeof row.domain === 'string' ? row.domain : null,
        path: typeof row.path === 'string' ? row.path : '',
        chunks: Number(row.chunk_count ?? 0),
      })),
    }
  } finally {
    db.close()
  }
}

/** Counts for one domain across its paper and notes KBs. */
export function domainCounts(domain: DomainConfig): KbCounts {
  let papers = 0
  let reports = 0
  let notes = 0
  let chunks = 0
  let vectors = 0
  const roots = [domain.kbRoot, ...(domain.notesRoot === undefined ? [] : [domain.notesRoot])]
  for (const root of roots) {
    const db = open(root)
    if (db === undefined) continue
    try {
      const columnsSet = columns(db, 'docs')
      if (columnsSet.size === 0 || !columnsSet.has('domain')) continue
      const where = whereFor(columnsSet, { domain: domain.id })
      const rows = db.prepare(`SELECT kind, count(*) AS docs, coalesce(sum(chunk_count), 0) AS chunks FROM docs${where.sql} GROUP BY kind`).all(...where.args) as unknown as Array<Record<string, unknown>>
      for (const row of rows) {
        const count = Number(row.docs ?? 0)
        const kind = String(row.kind ?? '')
        if (kind === 'pdf') papers += count
        else if (kind === 'md' || kind === 'markdown') reports += count
        else notes += count
        chunks += Number(row.chunks ?? 0)
      }
      if (hasTable(db, 'vecs') && hasTable(db, 'chunks')) {
        const vec = db.prepare(
          'SELECT count(*) AS n FROM vecs v JOIN chunks c ON c.id = v.chunk_id WHERE c.doc_id IN (SELECT id FROM docs WHERE domain = ?)',
        ).get(domain.id) as unknown as { n?: unknown } | undefined
        vectors += Number(vec?.n ?? 0)
      }
    } finally {
      db.close()
    }
  }
  return { papers, reports, notes, chunks, vectors }
}

/** All known indexed paths under one domain, used for orphan detection. */
export function indexedPaths(domain: DomainConfig): string[] {
  const roots = [domain.kbRoot, ...(domain.notesRoot === undefined ? [] : [domain.notesRoot])]
  const paths = new Set<string>()
  for (const root of roots) {
    const db = open(root)
    if (db === undefined) continue
    try {
      const rows = db.prepare('SELECT path FROM docs').all() as unknown as Array<{ path?: unknown }>
      for (const row of rows) if (typeof row.path === 'string') paths.add(resolve(row.path))
    } catch {
      // ignore unreadable DBs
    } finally {
      db.close()
    }
  }
  return [...paths]
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.kb', '.kb-papers', '.kb-notes', '.pm-domain', 'domains', 'reports', '_browsertest'])

/** Scan workspace PDFs that are not in the selected domain's KB. Read-only, bounded. */
export async function orphanPdfs(workspace: string, domain: DomainConfig, limit = 100): Promise<Array<{ path: string; size: number }>> {
  const known = new Set(indexedPaths(domain))
  const found: Array<{ path: string; size: number }> = []
  async function walk(directory: string, depth: number): Promise<void> {
    if (found.length >= limit || depth > 6) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.browser')) continue
        await walk(join(directory, entry.name), depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        const path = resolve(directory, entry.name)
        if (!known.has(path)) found.push({ path, size: 0 })
      }
    }
  }
  await walk(resolve(workspace), 0)
  return found
}

/** Empty counts for a domain whose KB has not been migrated yet. */
export function emptyCounts(): KbCounts {
  return EMPTY_COUNTS
}
