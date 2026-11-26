/** Read and validate the workspace + global domain registry. */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { DomainConfig, DomainRegistry } from './types.ts'

/** Resolve the DSH home that owns the global domains fallback. */
export function resolveHomeDir(explicit?: string): string {
  if (explicit !== undefined && explicit.trim() !== '') return resolve(explicit.trim())
  const fromEnv = process.env.DSH_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== '') return resolve(fromEnv.trim())
  return join(homedir(), '.pmstudio')
}

/** Absolute path of the active-domain state file. */
export function statePath(workspace: string): string {
  return join(workspace, '.pm-domain', 'state.json')
}

/** Whether a workspace-relative domain path stays inside the workspace. */
function insideWorkspace(workspace: string, raw: string): string | undefined {
  if (raw.trim() === '' || isAbsolute(raw)) return undefined
  const resolved = resolve(workspace, raw)
  const rel = relative(workspace, resolved)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined
  return resolved
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').map(entry => entry.trim())
    : []
}

interface Layer {
  readonly domains: Map<string, DomainConfig>
  readonly defaultDomain?: string
}

function parseDomain(
  raw: unknown,
  directoryName: string,
  workspace: string,
  warnings: string[],
): DomainConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${directoryName}: domain.json is not an object`)
    return undefined
  }
  const record = raw as Record<string, unknown>
  const id = asString(record.id) ?? directoryName
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/u.test(id)) {
    warnings.push(`${directoryName}: invalid domain id ${JSON.stringify(id)}`)
    return undefined
  }
  const kbRaw = asString(record.kbRoot)
  if (kbRaw === undefined) {
    warnings.push(`${id}: missing kbRoot`)
    return undefined
  }
  const kbRoot = insideWorkspace(workspace, kbRaw)
  if (kbRoot === undefined) {
    warnings.push(`${id}: kbRoot must stay inside the workspace (${kbRaw})`)
    return undefined
  }
  const notesRaw = asString(record.notesRoot)
  const notesRoot = notesRaw === undefined ? undefined : insideWorkspace(workspace, notesRaw)
  if (notesRaw !== undefined && notesRoot === undefined) {
    warnings.push(`${id}: notesRoot must stay inside the workspace (${notesRaw})`)
    return undefined
  }
  const allowedKinds = asStringArray(record.allowedKinds)
  const kinds = allowedKinds.length > 0 ? allowedKinds : ['pdf']
  const requestedDefault = asString(record.defaultKind)
  const defaultKind = requestedDefault !== undefined && (requestedDefault === 'all' || kinds.includes(requestedDefault))
    ? requestedDefault
    : kinds[0] ?? 'pdf'
  const priorityRaw = typeof record.priority === 'number' && Number.isFinite(record.priority) ? record.priority : 0
  const zoteroCollection = asString(record.zoteroCollection)
  const litProject = asString(record.litProject)
  return {
    schemaVersion: 1,
    id,
    name: asString(record.name) ?? id,
    description: asString(record.description) ?? '',
    keywords: asStringArray(record.keywords),
    kbRoot,
    ...(notesRoot === undefined ? {} : { notesRoot }),
    ...(zoteroCollection === undefined ? {} : { zoteroCollection }),
    ...(litProject === undefined ? {} : { litProject }),
    allowedKinds: kinds,
    defaultKind,
    relatedDomains: asStringArray(record.relatedDomains),
    priority: priorityRaw,
  }
}

async function readLayer(
  root: string,
  workspace: string,
  source: 'workspace' | 'global',
  warnings: string[],
): Promise<Layer> {
  const domains = new Map<string, DomainConfig>()
  let defaultDomain: string | undefined
  if (!existsSync(root)) return { domains }
  try {
    const registryFile = join(root, 'registry.json')
    if (existsSync(registryFile)) {
      const parsed = JSON.parse((await readFile(registryFile, 'utf8')).replace(/^\uFEFF/u, '')) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        defaultDomain = asString((parsed as Record<string, unknown>).defaultDomain)
      }
    }
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = join(root, entry.name, 'domain.json')
      if (!existsSync(file)) continue
      let parsed: unknown
      try {
        parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, ''))
      } catch (cause) {
        warnings.push(`${source}/${entry.name}: invalid JSON (${cause instanceof Error ? cause.message : String(cause)})`)
        continue
      }
      const domain = parseDomain(parsed, entry.name, workspace, warnings)
      if (domain !== undefined) domains.set(domain.id, domain)
    }
  } catch (cause) {
    warnings.push(`${source} registry unreadable: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  return { domains, ...(defaultDomain === undefined ? {} : { defaultDomain }) }
}

/** Read the merged registry. Workspace declarations override global ones by id. */
export async function loadRegistry(workspace: string, homeDir: string): Promise<DomainRegistry> {
  const resolvedWorkspace = resolve(workspace)
  const warnings: string[] = []
  const globalLayer = await readLayer(join(homeDir, 'domains'), resolvedWorkspace, 'global', warnings)
  const workspaceLayer = await readLayer(join(resolvedWorkspace, 'domains'), resolvedWorkspace, 'workspace', warnings)
  const merged = new Map<string, DomainConfig>(globalLayer.domains)
  for (const [id, domain] of workspaceLayer.domains) merged.set(id, domain)
  for (const domain of merged.values()) {
    if (domain.relatedDomains.length === 0) continue
    const kept = domain.relatedDomains.filter(id => merged.has(id) && id !== domain.id)
    for (const missing of domain.relatedDomains) {
      if (!merged.has(missing)) warnings.push(`${domain.id}: related domain not found: ${missing}`)
    }
    if (kept.length !== domain.relatedDomains.length) {
      merged.set(domain.id, Object.freeze({ ...domain, relatedDomains: Object.freeze(kept) }))
    }
  }
  const domains = [...merged.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  const requestedDefault = workspaceLayer.defaultDomain ?? globalLayer.defaultDomain
  const defaultDomain = requestedDefault !== undefined && merged.has(requestedDefault)
    ? requestedDefault
    : domains[0]?.id
  return {
    workspace: resolvedWorkspace,
    domains,
    ...(defaultDomain === undefined ? {} : { defaultDomain }),
    warnings,
  }
}

/** Find one domain by id. */
export function findDomain(registry: DomainRegistry, id: string): DomainConfig | undefined {
  return registry.domains.find(domain => domain.id === id)
}
