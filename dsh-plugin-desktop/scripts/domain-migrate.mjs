#!/usr/bin/env node
/**
 * One-time KB domain migration for PolyMechanism Studio 2.5.0.
 *
 * Dry-run (default): read the existing workspace .kb, propose a domain for every
 * doc, report unindexed PDFs, and print target counts. Nothing is written.
 *
 * --apply: back up .kb, create domains/registry.json + .pm-domain/state.json,
 * re-ingest paper PDFs into .kb-papers (tagged with their domain) and internal
 * reports/notes into .kb-notes (tagged with the primary domain). The old .kb is
 * kept untouched.
 *
 * Usage:
 *   node dsh-plugin-desktop/scripts/domain-migrate.mjs --workspace D:\path\to\workspace
 *   node dsh-plugin-desktop/scripts/domain-migrate.mjs --workspace ... --apply
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const ENGINE = fileURLToPath(new URL('../../vendor/dsh-kb-rag/kb_engine.py', import.meta.url))
const PRIMARY = 'pva-optical-film'
const NOTES = 'internal-notes'

function parseArgs(argv) {
  const options = { workspace: process.cwd(), apply: false, limit: 200 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--workspace') options.workspace = argv[++index] ?? ''
    else if (arg === '--apply') options.apply = true
    else if (arg === '--limit') options.limit = Number(argv[++index] ?? '200')
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node domain-migrate.mjs --workspace <dir> [--apply]')
      process.exit(0)
    }
  }
  if (!options.workspace) throw new Error('--workspace is required')
  return options
}

function classify(title, path) {
  const text = `${title ?? ''} ${basename(path ?? '')}`.toLowerCase()
  if (/(pva|polyvinyl|聚乙烯醇|ポリビニル|双轴拉伸|双折射|取向|结晶度|热定型|hibi|nishio|ursu|orientation|birefringence)/u.test(text)) {
    return PRIMARY
  }
  if (/(silver|nanoparticle|nanopart|pmma|plasticulture)/u.test(text)) {
    return 'generic-polymer'
  }
  if (/(waxs|saxs|giwaxs|waxd|衍射|散射|crystallinity|pvdf|objective function|semicrystalline)/u.test(text)) {
    return 'waxs-methods'
  }
  return 'generic-polymer'
}

function readDocs(kbRoot) {
  const file = join(kbRoot, 'kb.sqlite')
  if (!existsSync(file)) return []
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const columns = db.prepare('PRAGMA table_info(docs)').all().map(row => String(row.name))
    const hasDomain = columns.includes('domain')
    const rows = db.prepare(`SELECT id, title, path, kind, sha256, chunk_count${hasDomain ? ', domain' : ''} FROM docs ORDER BY id`).all()
    return rows.map(row => ({
      id: Number(row.id),
      title: typeof row.title === 'string' ? row.title : null,
      path: String(row.path),
      kind: String(row.kind ?? ''),
      sha256: typeof row.sha256 === 'string' ? row.sha256 : null,
      chunks: Number(row.chunk_count ?? 0),
      domain: hasDomain && typeof row.domain === 'string' ? row.domain : null,
    }))
  } finally {
    db.close()
  }
}

function walkPdfs(root, limit) {
  const found = []
  const skip = new Set(['.git', 'node_modules', '.kb', '.kb-papers', '.kb-notes', '.pm-domain', 'domains', 'reports', '_browsertest'])
  function walk(directory, depth) {
    if (found.length >= limit || depth > 6) return
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (found.length >= limit) return
      if (entry.isDirectory()) {
        if (skip.has(entry.name) || entry.name.startsWith('.browser')) continue
        walk(join(directory, entry.name), depth + 1)
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        const path = resolve(directory, entry.name)
        try {
          found.push({
            path,
            sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
            size: statSync(path).size,
          })
        } catch { /* unreadable */ }
      }
    }
  }
  walk(root, 0)
  return found
}

function runIngest(kbRoot, paths, domain) {
  const python = process.env.KB_RAG_PYTHON || 'python'
  const result = spawnSync(python, ['-I', ENGINE, 'ingest'], {
    input: JSON.stringify({ kb_root: kbRoot, paths, domain, async_if_large: false }),
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  })
  const stdout = String(result.stdout ?? '').trim()
  const line = stdout.split('\n').filter(Boolean).pop()
  if (result.status !== 0 || line === undefined) {
    throw new Error(`ingest failed (${String(result.status)}): ${String(result.stderr ?? '').slice(-800)}`)
  }
  const parsed = JSON.parse(line)
  if (parsed.ok === false) throw new Error(`ingest rejected: ${JSON.stringify(parsed).slice(0, 800)}`)
  return parsed
}

function writeJson(file, value) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function domainConfig(id, name, description, keywords, relatedDomains, priority) {
  return {
    schemaVersion: 1,
    id,
    name,
    description,
    keywords,
    kbRoot: '.kb-papers',
    notesRoot: '.kb-notes',
    zoteroCollection: id === PRIMARY ? 'PVA' : undefined,
    litProject: id === PRIMARY ? PRIMARY : id,
    allowedKinds: ['pdf'],
    defaultKind: 'pdf',
    relatedDomains,
    priority,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const workspace = resolve(options.workspace)
  const oldKb = join(workspace, '.kb')
  if (!existsSync(join(oldKb, 'kb.sqlite'))) throw new Error(`old KB not found: ${oldKb}`)
  const docs = readDocs(oldKb)
  const knownHashes = new Set(docs.map(doc => doc.sha256).filter(Boolean))
  const pdfs = walkPdfs(workspace, options.limit)
  const mapped = docs.map(doc => ({
    ...doc,
    proposedDomain: doc.kind === 'pdf' ? classify(doc.title, doc.path) : PRIMARY,
    target: doc.kind === 'pdf' ? '.kb-papers' : '.kb-notes',
  }))
  const missing = pdfs.filter(pdf => !knownHashes.has(pdf.sha256))
  const report = {
    ok: true,
    workspace,
    oldKb,
    apply: options.apply,
    docs: mapped.map(doc => ({
      id: doc.id, title: doc.title, kind: doc.kind,
      domain: doc.proposedDomain, target: doc.target, path: doc.path, chunks: doc.chunks,
    })),
    counts: {
      papers: mapped.filter(doc => doc.target === '.kb-papers').length,
      notes: mapped.filter(doc => doc.target === '.kb-notes').length,
      byDomain: mapped.filter(doc => doc.target === '.kb-papers').reduce((acc, doc) => {
        acc[doc.proposedDomain] = (acc[doc.proposedDomain] ?? 0) + 1
        return acc
      }, {}),
    },
    unindexedPdfs: missing.map(pdf => pdf.path),
    note: options.apply ? 'applied' : 'dry-run: nothing written; rerun with --apply',
  }
  if (!options.apply) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const backup = `${oldKb}-backup-${stamp}`
  cpSync(oldKb, backup, { recursive: true })
  const papersKb = join(workspace, '.kb-papers')
  const notesKb = join(workspace, '.kb-notes')
  mkdirSync(papersKb, { recursive: true })
  mkdirSync(notesKb, { recursive: true })

  const configs = {
    [PRIMARY]: domainConfig(
      PRIMARY,
      'PVA 光学膜',
      'PVA 双轴拉伸、取向、结晶度、双折射',
      ['PVA', 'polyvinyl alcohol', '聚乙烯醇', '双轴拉伸', '双折射', '取向', '结晶度', '热定型'],
      ['waxs-methods'],
      10,
    ),
    'waxs-methods': domainConfig(
      'waxs-methods',
      'WAXS/SAXS 方法',
      'WAXS/SAXS/GIWAXS/WAXD、衍射/散射、结晶度方法',
      ['WAXS', 'SAXS', 'GIWAXS', 'WAXD', '衍射', '散射', 'crystallinity', 'PVDF'],
      [PRIMARY],
      5,
    ),
    'generic-polymer': domainConfig(
      'generic-polymer',
      '通用高分子',
      '其他高分子/纳米颗粒/方法参考',
      ['polymer', 'nanoparticle', '高分子'],
      [],
      0,
    ),
  }
  for (const [id, config] of Object.entries(configs)) {
    writeJson(join(workspace, 'domains', id, 'domain.json'), config)
  }
  writeJson(join(workspace, 'domains', 'registry.json'), { schemaVersion: 1, defaultDomain: PRIMARY })
  writeJson(join(workspace, '.pm-domain', 'state.json'), {
    schemaVersion: 1,
    domain: PRIMARY,
    updatedAt: new Date().toISOString(),
  })

  const groups = new Map()
  for (const doc of mapped) {
    const key = `${doc.target}|${doc.proposedDomain}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(doc.path)
  }
  const results = []
  for (const [key, paths] of groups) {
    const [target, domain] = key.split('|')
    const kbRoot = target === '.kb-papers' ? papersKb : notesKb
    results.push({ target, domain, files: paths.length, result: runIngest(kbRoot, paths, domain) })
  }
  console.log(JSON.stringify({
    ...report,
    backup,
    results: results.map(item => ({
      target: item.target,
      domain: item.domain,
      files: item.files,
      totals: item.result.totals,
      kb_root: item.result.kb_root,
    })),
  }, null, 2))
}

main()
