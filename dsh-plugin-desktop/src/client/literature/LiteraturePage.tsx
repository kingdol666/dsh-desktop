/** Domain-isolated Literature page: inventory, search, PDF open and health. */

import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: registers the `main` slot in the client SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { literatureCopy, type LiteratureCopy } from './copy.ts'
import {
  fetchDomains,
  fetchLiterature,
  fetchOrphans,
  setActiveDomain as persistActiveDomain,
  type DomainSummary,
  type KbDoc,
  type LiteratureResponse,
} from './data.ts'

/** Face injected by the desktop client registration. */
export interface LiteraturePageInjected {
  readonly workspaces: () => readonly string[]
  readonly openPdf: (workspace: string, path: string) => void
  readonly locale: string
}

/** Composed props for the keyed `main` slot. */
export type LiteraturePageProps =
  PropsRuntime<'main'>
  & InjectFace<LiteraturePageInjected>

type Tab = 'papers' | 'notes'

const safe = (value: unknown): string => (typeof value === 'string' ? value : '')

function documentRows(data: LiteratureResponse | null, tab: Tab): readonly KbDoc[] {
  if (data === null) return []
  return tab === 'papers' ? data.papers.docs : data.notes.docs
}

function filterDocs(docs: readonly KbDoc[], query: string): KbDoc[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') return [...docs]
  return docs.filter(doc => {
    const title = safe(doc.title).toLowerCase()
    const doi = safe(doc.doi).toLowerCase()
    return title.includes(trimmed) || doi.includes(trimmed) || doc.path.toLowerCase().includes(trimmed)
  })
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

/**
 * Render the Literature inventory. Data comes from the authenticated
 * `/api/pm-domain/*` routes; PDFs open in the right sidebar through the
 * injected face (which returns to the conversation first).
 */
export function LiteraturePage({ workspaces, openPdf, locale }: LiteraturePageProps) {
  const copy: LiteratureCopy = literatureCopy(locale)
  const initialWorkspaces = workspaces()
  const [workspace, setWorkspace] = useState(initialWorkspaces[0] ?? '')
  const [domains, setDomains] = useState<readonly DomainSummary[]>([])
  const [activeDomain, setActiveDomain] = useState('')
  const [data, setData] = useState<LiteratureResponse | null>(null)
  const [tab, setTab] = useState<Tab>('papers')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const [orphans, setOrphans] = useState<{ total: number; paths: string[] } | null>(null)

  const workspaceOptions = useMemo(() => [...workspaces()], [workspaces])

  useEffect(() => {
    if (workspace === '') return
    let live = true
    setLoading(true)
    setError('')
    setData(null)
    setOrphans(null)
    void fetchDomains(workspace)
      .then((response) => {
        if (!live) return
        setDomains(response.domains)
        setWarnings(response.warnings)
        const preferred = response.activeDomain !== null && response.domains.some(item => item.id === response.activeDomain)
          ? response.activeDomain
          : response.domains[0]?.id ?? ''
        setActiveDomain(preferred)
      })
      .catch((cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [workspace])

  useEffect(() => {
    if (workspace === '' || activeDomain === '') return
    let live = true
    setLoading(true)
    setError('')
    setData(null)
    void fetchLiterature(workspace, activeDomain, 'pdf', 200)
      .then((response) => { if (live) setData(response) })
      .catch((cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [workspace, activeDomain])

  const docs = filterDocs(documentRows(data, tab), query)
  const currentDomain = domains.find(item => item.id === activeDomain)
  const counts = data?.counts ?? currentDomain?.counts

  const changeDomain = (next: string): void => {
    setActiveDomain(next)
    setTab('papers')
    setOrphans(null)
    void persistActiveDomain(workspace, next).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const scanOrphans = (): void => {
    if (workspace === '' || activeDomain === '') return
    setError('')
    void fetchOrphans(workspace, activeDomain)
      .then(response => setOrphans({ total: response.total, paths: response.paths.map(item => item.path) }))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  const open = (doc: KbDoc): void => {
    try {
      openPdf(workspace, doc.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className="pm-lit-page" data-testid="pm-literature-page">
      <header className="pm-lit-header">
        <div>
          <h1 className="pm-lit-title">{copy.title}</h1>
          <p className="pm-lit-subtitle">{copy.subtitle}</p>
        </div>
        <div className="pm-lit-controls">
          {workspaceOptions.length > 1 && (
            <label className="pm-lit-field">
              {copy.workspace}
              <select data-testid="pm-lit-workspace" value={workspace} onChange={event => setWorkspace(event.target.value)}>
                {workspaceOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
          <label className="pm-lit-field">
            {copy.domain}
            <select
              data-testid="pm-lit-domain"
              value={activeDomain}
              disabled={domains.length === 0}
              onChange={event => changeDomain(event.target.value)}
            >
              {domains.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      {workspace === '' && <div className="pm-lit-empty">{copy.noWorkspace}</div>}
      {workspace !== '' && domains.length === 0 && !loading && !error && (
        <div className="pm-lit-empty">{copy.noDomains}</div>
      )}
      {error !== '' && <div className="pm-lit-error" role="alert">{error}</div>}
      {warnings.length > 0 && <div className="pm-lit-warning">{warnings.join('；')}</div>}

      {counts !== undefined && (
        <div className="pm-lit-cards">
          <div className="pm-lit-card">
            <div className="pm-lit-card-label">{copy.papers}</div>
            <div className="pm-lit-card-value">{formatCount(counts.papers)}</div>
          </div>
          <div className="pm-lit-card">
            <div className="pm-lit-card-label">{copy.reports}</div>
            <div className="pm-lit-card-value">{formatCount(counts.reports)}</div>
          </div>
          <div className="pm-lit-card">
            <div className="pm-lit-card-label">{copy.notes}</div>
            <div className="pm-lit-card-value">{formatCount(counts.notes)}</div>
          </div>
          <div className="pm-lit-card">
            <div className="pm-lit-card-label">{copy.vector}</div>
            <div className="pm-lit-card-value">{formatCount(counts.vectors)}</div>
            <div className="pm-lit-card-note">
              {counts.vectors === 0 ? copy.keywordFallback : `${formatCount(counts.chunks)} ${copy.chunks}`}
            </div>
          </div>
        </div>
      )}

      <div className="pm-lit-toolbar">
        <div className="pm-lit-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="pm-lit-tab"
            data-active={tab === 'papers'}
            onClick={() => setTab('papers')}
          >
            {copy.papers} {data === null ? '' : `(${data.papers.total})`}
          </button>
          <button
            type="button"
            role="tab"
            className="pm-lit-tab"
            data-active={tab === 'notes'}
            onClick={() => setTab('notes')}
          >
            {copy.reports} + {copy.notes} {data === null ? '' : `(${data.notes.total})`}
          </button>
        </div>
        <input
          className="pm-lit-search"
          data-testid="pm-lit-search"
          value={query}
          placeholder={copy.search}
          onChange={event => setQuery(event.target.value)}
        />
        <button type="button" className="pm-lit-button" data-testid="pm-lit-orphans" onClick={scanOrphans}>
          {copy.orphanScan}
        </button>
      </div>

      {orphans !== null && (
        <div className="pm-lit-warning">
          {copy.orphanScan}: {orphans.total} · {copy.orphanHint}
          {orphans.paths.length > 0 && (
            <div className="pm-lit-muted">{orphans.paths.slice(0, 5).join(' · ')}</div>
          )}
        </div>
      )}

      {data !== null && (
        <div className="pm-lit-health">
          <span>{data.domain.name}</span>
          {data.domain.zoteroCollection !== undefined && <span>Zotero: {data.domain.zoteroCollection}</span>}
          {data.domain.litProject !== undefined && <span>lit: {data.domain.litProject}</span>}
          {data.domain.relatedDomains.length > 0 && <span>related: {data.domain.relatedDomains.join(', ')}</span>}
        </div>
      )}

      <div className="pm-lit-table-wrap">
        {loading && <div className="pm-lit-empty">{copy.loading}</div>}
        {!loading && docs.length === 0 && <div className="pm-lit-empty">{copy.empty}</div>}
        {!loading && docs.length > 0 && (
          <table className="pm-lit-table" data-testid="pm-lit-table">
            <thead>
              <tr>
                <th>{copy.title}</th>
                <th>{copy.year}</th>
                <th>DOI</th>
                <th>{copy.type}</th>
                <th>{copy.chunks}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={`${doc.id}-${doc.path}`}>
                  <td>
                    <div className="pm-lit-doc-title">{safe(doc.title) || doc.path.split(/[\\/]/u).pop() || doc.path}</div>
                    <div className="pm-lit-muted">{doc.path}</div>
                  </td>
                  <td>{doc.year ?? '—'}</td>
                  <td>{doc.doi ?? '—'}</td>
                  <td>{doc.kind}</td>
                  <td>{doc.chunks}</td>
                  <td>
                    <button type="button" className="pm-lit-button" onClick={() => open(doc)}>
                      {copy.open}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
