#!/usr/bin/env node
/**
 * Push downloaded PDFs into the local Zotero library through Zotero's own
 * connector API (the same endpoint the browser connector uses).
 *
 * The endpoint is a fixed loopback service owned by the user's Zotero install;
 * it is not derived from any document or remote response. No paywall is
 * bypassed: only PDFs already saved locally by the literature downloader are
 * attached.
 *
 * Usage: node scripts/literature-to-zotero.mjs entries.json
 * entries.json: [{ "doi": "...", "pdf": "D:/path/file.pdf" }, ...]
 */
import { readFile } from 'node:fs/promises'

const ZOTERO_CONNECTOR = 'http://127.0.0.1:23119'
const entriesPath = process.argv[2]
if (!entriesPath) {
  console.error('usage: node scripts/literature-to-zotero.mjs entries.json')
  process.exit(2)
}

const entries = JSON.parse(await readFile(entriesPath, 'utf8'))

async function crossref(doi) {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { 'user-agent': 'polymechanism-studio/2.1 (mailto:research@example.edu)' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`crossref ${response.status}`)
  return (await response.json()).message
}

function creators(message) {
  return (message.author ?? []).map(person => ({
    firstName: person.given ?? '',
    lastName: person.family ?? person.name ?? '',
  })).filter(person => person.lastName)
}

function yearOf(message) {
  const parts = message.issued?.['date-parts']?.[0]
  return parts?.[0] ? String(parts[0]) : ''
}

async function push(entry) {
  const message = await crossref(entry.doi)
  const sessionID = `dsh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const connectorId = 'item-1'
  const item = {
    id: connectorId,
    itemType: 'journalArticle',
    title: message.title?.[0] ?? entry.doi,
    creators: creators(message),
    date: yearOf(message),
    DOI: entry.doi,
    publicationTitle: message['container-title']?.[0] ?? '',
    volume: message.volume ?? '',
    issue: message.issue ?? '',
    pages: message.page ?? '',
    url: message.URL ?? `https://doi.org/${entry.doi}`,
    tags: [],
  }
  const saved = await fetch(`${ZOTERO_CONNECTOR}/connector/saveItems`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionID, uri: item.url, items: [item] }),
    signal: AbortSignal.timeout(60000),
  })
  if (saved.status !== 201) throw new Error(`saveItems ${saved.status}: ${await saved.text()}`)

  const pdf = await readFile(entry.pdf)
  const attached = await fetch(`${ZOTERO_CONNECTOR}/connector/saveAttachment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-metadata': JSON.stringify({
        sessionID,
        parentItemID: connectorId,
        url: item.url,
        title: 'Full Text PDF',
      }),
    },
    body: pdf,
    signal: AbortSignal.timeout(120000),
  })
  if (attached.status !== 201) throw new Error(`saveAttachment ${attached.status}: ${await attached.text()}`)
  return { doi: entry.doi, sessionID, title: item.title, bytes: pdf.length }
}

const results = []
for (const entry of entries) {
  try {
    results.push({ ok: true, ...await push(entry) })
  } catch (cause) {
    results.push({ ok: false, doi: entry.doi, error: String(cause?.message ?? cause) })
  }
}
console.log(JSON.stringify(results, null, 1))
