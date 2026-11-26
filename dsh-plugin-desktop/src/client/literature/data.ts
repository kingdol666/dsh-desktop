/** Same-origin API helpers for the Literature page. */

export interface DomainCounts {
  readonly papers: number
  readonly reports: number
  readonly notes: number
  readonly chunks: number
  readonly vectors: number
}

export interface DomainSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly kbRoot: string
  readonly notesRoot?: string
  readonly zoteroCollection?: string
  readonly litProject?: string
  readonly allowedKinds: readonly string[]
  readonly defaultKind: string
  readonly relatedDomains: readonly string[]
  readonly priority: number
  readonly counts: DomainCounts
}

export interface DomainsResponse {
  readonly ok: true
  readonly workspace: string
  readonly domains: readonly DomainSummary[]
  readonly activeDomain: string | null
  readonly projectId: string | null
  readonly warnings: readonly string[]
}

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

export interface DocsPage {
  readonly docs: readonly KbDoc[]
  readonly total: number
  readonly domainColumn: boolean
}

export interface LiteratureResponse {
  readonly ok: true
  readonly workspace: string
  readonly domain: DomainSummary
  readonly activeDomain: string | null
  readonly projectId: string | null
  readonly counts: DomainCounts
  readonly papers: DocsPage
  readonly notes: DocsPage
  readonly health: {
    readonly domainColumn: boolean
    readonly vectors: number
    readonly note: string
  }
}

export interface OrphansResponse {
  readonly ok: true
  readonly workspace: string
  readonly domain: string
  readonly total: number
  readonly paths: ReadonlyArray<{ readonly path: string; readonly size: number }>
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${String(response.status)}${text === '' ? '' : `: ${text.slice(0, 200)}`}`)
  }
  return await response.json() as T
}

/** Load domain summaries and the active domain for one workspace. */
export function fetchDomains(workspace: string): Promise<DomainsResponse> {
  return getJson<DomainsResponse>(`/api/pm-domain/domains?workspace=${encodeURIComponent(workspace)}`)
}

/** Load one domain's paper/notes pages and counts. */
export function fetchLiterature(workspace: string, domain: string, kind = 'pdf', limit = 200): Promise<LiteratureResponse> {
  const query = new URLSearchParams({ workspace, domain, kind, limit: String(limit) })
  return getJson<LiteratureResponse>(`/api/pm-domain/literature?${query.toString()}`)
}

/** Persist the active domain for the workspace. */
export async function setActiveDomain(workspace: string, domain: string, projectId?: string): Promise<void> {
  const response = await fetch('/api/pm-domain/active', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ workspace, domain, ...(projectId === undefined ? {} : { projectId }) }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${String(response.status)}${text === '' ? '' : `: ${text.slice(0, 200)}`}`)
  }
}

/** Read-only unindexed-PDF scan. */
export function fetchOrphans(workspace: string, domain: string): Promise<OrphansResponse> {
  const query = new URLSearchParams({ workspace, domain })
  return getJson<OrphansResponse>(`/api/pm-domain/orphans?${query.toString()}`)
}
