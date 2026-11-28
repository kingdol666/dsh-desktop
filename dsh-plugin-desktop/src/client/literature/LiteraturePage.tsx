/** Domain-isolated Literature page: searchable inventory, scope, and PDF open. */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: registers the `main` slot in the client SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ArrowUpRight, BookOpen, Database, FileText, Search, SlidersHorizontal } from 'lucide-react'
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

export interface LiteratureLocaleFace {
  readonly getSnapshot: () => { readonly active: string }
  readonly subscribe: (listener: () => void) => () => void
}

/** Face injected by the desktop client registration. */
export interface LiteraturePageInjected {
  readonly workspaces: () => readonly string[]
  readonly openPdf: (workspace: string, path: string) => Promise<void>
  readonly locale: LiteratureLocaleFace
}

/** Composed props for the keyed `main` slot. */
export type LiteraturePageProps =
  PropsRuntime<'main'>
  & InjectFace<LiteraturePageInjected>

type Tab = 'papers' | 'notes'
type FailureStage = 'domains' | 'literature' | 'persistence' | 'orphans' | 'pdf'

interface LiteratureFailure {
  readonly stage: FailureStage
  readonly code: string
  readonly message: string
}

interface LoadedLiterature {
  readonly workspace: string
  readonly domain: string
  readonly response: LiteratureResponse
}

interface OrphanResult {
  readonly workspace: string
  readonly domain: string
  readonly total: number
  readonly paths: readonly string[]
}

const safe = (value: unknown): string => (typeof value === 'string' ? value : '')

function documentRows(data: LiteratureResponse | null, tab: Tab): readonly KbDoc[] {
  if (data === null) return []
  return tab === 'papers' ? data.papers.docs : data.notes.docs
}

function filterDocs(docs: readonly KbDoc[], query: string, kind: string): KbDoc[] {
  const trimmed = query.trim().toLowerCase()
  return docs.filter((doc) => {
    if (kind !== '' && doc.kind !== kind) return false
    if (trimmed === '') return true
    const title = safe(doc.title).toLowerCase()
    const doi = safe(doc.doi).toLowerCase()
    return title.includes(trimmed) || doi.includes(trimmed) || doc.path.toLowerCase().includes(trimmed)
  })
}

function failureOf(cause: unknown, stage: FailureStage): LiteratureFailure {
  const message = cause instanceof Error ? cause.message : String(cause)
  const status = /^HTTP (\d{3})/u.exec(message)?.[1]
  return {
    stage,
    code: status === undefined
      ? (stage === 'persistence' ? 'SAVE' : stage === 'pdf' ? 'PREVIEW' : 'REQUEST')
      : `HTTP ${status}`,
    message: message || 'Unknown error',
  }
}

function pdfFailureOf(cause: unknown, copy: LiteratureCopy): LiteratureFailure {
  const reason = cause instanceof Error ? cause.message : ''
  const message = reason === 'PM_LIT_PDF_NO_WORKSPACE_SESSION'
    ? copy.pdfNoSession
    : reason === 'PM_LIT_PDF_PREVIEW_UNAVAILABLE'
      ? copy.pdfPreviewUnavailable
      : reason === 'PM_LIT_PDF_SESSION_MISMATCH'
        ? copy.pdfSessionMismatch
        : copy.pdfErrorMessage
  return { stage: 'pdf', code: 'PREVIEW', message }
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function LoadingRows({ copy }: { readonly copy: LiteratureCopy }) {
  return (
    <div className="pm-lit-loading" role="status" aria-label={copy.loading}>
      <span className="pm-lit-sr-only">{copy.loading}</span>
      <div className="pm-lit-skeleton-head" aria-hidden="true" />
      {Array.from({ length: 4 }, (_, index) => (
        <div className="pm-lit-skeleton-row" aria-hidden="true" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}

function ErrorNotice({
  failure,
  copy,
  onRetry,
  title = copy.errorTitle,
  nextStep = copy.errorNextStep,
}: {
  readonly failure: LiteratureFailure
  readonly copy: LiteratureCopy
  readonly onRetry?: () => void
  readonly title?: string
  readonly nextStep?: string
}) {
  return (
    <div className="pm-lit-error" role="alert">
      <div className="pm-lit-error-copy">
        <span className="pm-lit-error-code">{failure.code}</span>
        <strong>{title}</strong>
        <p>{failure.message}</p>
        <span>{nextStep}</span>
      </div>
      {onRetry !== undefined && (
        <button type="button" className="pm-lit-button" onClick={onRetry}>
          {copy.retry}
        </button>
      )}
    </div>
  )
}

/** Render the Literature inventory. PDFs open in the right sidebar through the injected face. */
export function LiteraturePage({ workspaces, openPdf, locale }: LiteraturePageProps) {
  const subscribeLocale = useMemo(() => (listener: () => void) => locale.subscribe(listener), [locale])
  const getActiveLocale = useMemo(() => () => locale.getSnapshot().active, [locale])
  const activeLocale = useSyncExternalStore(subscribeLocale, getActiveLocale, getActiveLocale)
  const copy: LiteratureCopy = literatureCopy(activeLocale)
  const workspaceOptions = useMemo(() => [...workspaces()], [workspaces])
  const [workspace, setWorkspace] = useState(() => workspaceOptions[0] ?? '')
  const [domains, setDomains] = useState<readonly DomainSummary[]>([])
  const [domainsWorkspace, setDomainsWorkspace] = useState('')
  const [activeDomain, setActiveDomain] = useState('')
  const [loadedLiterature, setLoadedLiterature] = useState<LoadedLiterature | null>(null)
  const [tab, setTab] = useState<Tab>('papers')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [domainLoading, setDomainLoading] = useState(false)
  const [literatureLoading, setLiteratureLoading] = useState(false)
  const [showDomainLoading, setShowDomainLoading] = useState(false)
  const [showLiteratureLoading, setShowLiteratureLoading] = useState(false)
  const [domainRetry, setDomainRetry] = useState(0)
  const [literatureRetry, setLiteratureRetry] = useState(0)
  const [failure, setFailure] = useState<LiteratureFailure | null>(null)
  const [pdfFailure, setPdfFailure] = useState<LiteratureFailure | null>(null)
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const [orphans, setOrphans] = useState<OrphanResult | null>(null)
  const [orphanLoading, setOrphanLoading] = useState(false)
  const selectionEpoch = useRef(0)
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const orphanRequest = useRef(0)

  useEffect(() => {
    if (workspace === '' && workspaceOptions.length > 0) setWorkspace(workspaceOptions[0]!)
    else if (workspace !== '' && !workspaceOptions.includes(workspace)) setWorkspace(workspaceOptions[0] ?? '')
  }, [workspace, workspaceOptions])

  useEffect(() => {
    if (workspace === '') {
      setDomains([])
      setDomainsWorkspace('')
      setActiveDomain('')
      setWarnings([])
      setDomainLoading(false)
      setShowDomainLoading(false)
      setPdfFailure(null)
      return undefined
    }

    let live = true
    setDomainLoading(true)
    setShowDomainLoading(false)
    setDomains([])
    setDomainsWorkspace('')
    setActiveDomain('')
    setWarnings([])
    setLoadedLiterature(null)
    setOrphans(null)
    setFailure(null)
    setPdfFailure(null)
    const timer = setTimeout(() => { if (live) setShowDomainLoading(true) }, 400)

    void fetchDomains(workspace)
      .then((response) => {
        if (!live) return
        setDomains(response.domains)
        setDomainsWorkspace(workspace)
        setWarnings(response.warnings)
        setFailure(current => current?.stage === 'domains' ? null : current)
        const preferred = response.activeDomain !== null && response.domains.some(item => item.id === response.activeDomain)
          ? response.activeDomain
          : response.domains[0]?.id ?? ''
        setActiveDomain(preferred)
      })
      .catch((cause: unknown) => { if (live) setFailure(failureOf(cause, 'domains')) })
      .finally(() => {
        clearTimeout(timer)
        if (live) {
          setDomainLoading(false)
          setShowDomainLoading(false)
        }
      })

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [workspace, domainRetry])

  const currentDomains = domainsWorkspace === workspace ? domains : []
  const currentDomain = currentDomains.find(item => item.id === activeDomain)

  useEffect(() => {
    if (workspace === '' || domainsWorkspace !== workspace || activeDomain === '' || currentDomain === undefined) {
      setLiteratureLoading(false)
      setShowLiteratureLoading(false)
      return undefined
    }

    let live = true
    setLiteratureLoading(true)
    setShowLiteratureLoading(false)
    const timer = setTimeout(() => { if (live) setShowLiteratureLoading(true) }, 400)

    void fetchLiterature(workspace, activeDomain, 'pdf', 200)
      .then((response) => {
        if (live) {
          setLoadedLiterature({ workspace, domain: activeDomain, response })
          setFailure(current => current?.stage === 'literature' ? null : current)
        }
      })
      .catch((cause: unknown) => { if (live) setFailure(failureOf(cause, 'literature')) })
      .finally(() => {
        clearTimeout(timer)
        if (live) {
          setLiteratureLoading(false)
          setShowLiteratureLoading(false)
        }
      })

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [workspace, domainsWorkspace, activeDomain, currentDomain, literatureRetry])

  const data = loadedLiterature?.workspace === workspace && loadedLiterature.domain === activeDomain
    ? loadedLiterature.response
    : null
  const counts = data?.counts ?? currentDomain?.counts
  const rows = documentRows(data, tab)
  const docs = filterDocs(rows, query, kind)
  const kindOptions = [...new Set(rows.map(doc => doc.kind))].sort((left, right) => left.localeCompare(right))
  const selectedOrphans = orphans?.workspace === workspace && orphans.domain === activeDomain ? orphans : null
  const isLoading = domainLoading || literatureLoading
  const showLoading = (domainLoading && showDomainLoading) || (literatureLoading && showLiteratureLoading)
  const hasWorkspace = workspace !== ''
  const hasDomain = currentDomain !== undefined
  const isDomainEmpty = hasWorkspace && domainsWorkspace === workspace && currentDomains.length === 0
    && !domainLoading && failure?.stage !== 'domains'

  const selectWorkspace = (nextWorkspace: string): void => {
    selectionEpoch.current += 1
    orphanRequest.current += 1
    setWorkspace(nextWorkspace)
    setActiveDomain('')
    setOrphans(null)
    setOrphanLoading(false)
    setFailure(null)
    setPdfFailure(null)
    setQuery('')
    setKind('')
    setTab('papers')
  }

  const persistDomainSelection = (targetWorkspace: string, targetDomain: string, epoch: number): void => {
    const write = persistQueue.current
      .catch(() => {})
      .then(async () => {
        // Keep rapid scope changes in order; a superseded queued write must not
        // persist an old domain after the user has already selected another.
        if (epoch !== selectionEpoch.current) return
        await persistActiveDomain(targetWorkspace, targetDomain)
        if (epoch === selectionEpoch.current) {
          setFailure(current => current?.stage === 'persistence' ? null : current)
        }
      })
      .catch((cause: unknown) => {
        if (epoch === selectionEpoch.current) setFailure(failureOf(cause, 'persistence'))
      })
    persistQueue.current = write
  }

  const changeDomain = (nextDomain: string): void => {
    if (nextDomain === '' || nextDomain === activeDomain) return
    selectionEpoch.current += 1
    const epoch = selectionEpoch.current
    orphanRequest.current += 1
    setActiveDomain(nextDomain)
    setTab('papers')
    setKind('')
    setOrphans(null)
    setOrphanLoading(false)
    setFailure(null)
    setPdfFailure(null)
    persistDomainSelection(workspace, nextDomain, epoch)
  }

  const scanOrphans = (): void => {
    if (workspace === '' || activeDomain === '' || currentDomain === undefined) return
    const request = ++orphanRequest.current
    const targetWorkspace = workspace
    const targetDomain = activeDomain
    setFailure(null)
    setOrphans(null)
    setOrphanLoading(true)
    void fetchOrphans(targetWorkspace, targetDomain)
      .then(response => {
        if (request === orphanRequest.current) {
          setOrphans({
            workspace: targetWorkspace,
            domain: targetDomain,
            total: response.total,
            paths: response.paths.map(item => item.path),
          })
          setFailure(current => current?.stage === 'orphans' ? null : current)
        }
      })
      .catch((cause: unknown) => {
        if (request === orphanRequest.current) setFailure(failureOf(cause, 'orphans'))
      })
      .finally(() => {
        if (request === orphanRequest.current) setOrphanLoading(false)
      })
  }

  const open = (doc: KbDoc): void => {
    setPdfFailure(null)
    void openPdf(workspace, doc.path)
      .catch(cause => setPdfFailure(pdfFailureOf(cause, copy)))
  }

  const retryFailure = (): void => {
    if (failure?.stage === 'domains') setDomainRetry(value => value + 1)
    else if (failure?.stage === 'literature') setLiteratureRetry(value => value + 1)
    else if (failure?.stage === 'persistence' && workspace !== '' && activeDomain !== '') {
      selectionEpoch.current += 1
      persistDomainSelection(workspace, activeDomain, selectionEpoch.current)
    } else if (failure?.stage === 'orphans') scanOrphans()
  }

  const clearFilters = (): void => {
    setQuery('')
    setKind('')
  }

  const moveCollectionTab = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const tabIds = ['papers', 'notes'] as const
    const currentIndex = tabIds.indexOf(tab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + tabIds.length - 1) % tabIds.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabIds.length - 1
    else return
    event.preventDefault()
    const nextTab = tabIds[nextIndex]!
    setTab(nextTab)
    setKind('')
    document.getElementById(`pm-lit-tab-${nextTab}`)?.focus()
  }

  return (
    <section className="pm-lit-page" data-testid="pm-literature-page" aria-labelledby="pm-lit-title">
      <header className="pm-lit-header">
        <div className="pm-lit-heading">
          <p className="pm-lit-eyebrow"><BookOpen size={14} aria-hidden="true" />{copy.eyebrow}</p>
          <h1 className="pm-lit-title" id="pm-lit-title">{copy.title}</h1>
          <p className="pm-lit-subtitle">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          className="pm-lit-button pm-lit-scan-button"
          data-testid="pm-lit-orphans"
          disabled={!hasDomain || orphanLoading || isLoading}
          onClick={scanOrphans}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          {orphanLoading ? copy.orphanScanning : copy.orphanScan}
        </button>
      </header>

      <section className="pm-lit-scope" aria-labelledby="pm-lit-scope-title">
        <div className="pm-lit-scope-heading">
          <span className="pm-lit-scope-icon" aria-hidden="true"><Database size={17} /></span>
          <div>
            <h2 id="pm-lit-scope-title">{copy.scopeTitle}</h2>
            <p>{copy.scopeHint}</p>
          </div>
        </div>
        <div className="pm-lit-scope-controls">
          <label className="pm-lit-field">
            <span>{copy.workspace}</span>
            {workspaceOptions.length > 1 ? (
              <select data-testid="pm-lit-workspace" value={workspace} onChange={event => selectWorkspace(event.target.value)}>
                {workspaceOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <span className="pm-lit-scope-value" title={workspace || undefined}>{workspace || '—'}</span>
            )}
          </label>
          <label className="pm-lit-field">
            <span>{copy.domain}</span>
            <select
              data-testid="pm-lit-domain"
              value={currentDomain === undefined ? '' : activeDomain}
              disabled={currentDomains.length === 0 || domainLoading}
              onChange={event => changeDomain(event.target.value)}
            >
              <option value="">{copy.noDomain}</option>
              {currentDomains.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
          </label>
        </div>
        {currentDomain !== undefined && (
          <div className="pm-lit-scope-detail">
            <p className="pm-lit-domain-description">{currentDomain.description || copy.noDescription}</p>
            <div className="pm-lit-scope-tags" aria-label={copy.collections}>
              {currentDomain.zoteroCollection !== undefined && (
                <span><b>{copy.zoteroCollection}</b>{currentDomain.zoteroCollection}</span>
              )}
              {currentDomain.litProject !== undefined && (
                <span><b>{copy.literatureProject}</b>{currentDomain.litProject}</span>
              )}
              {currentDomain.relatedDomains.length > 0 && (
                <span><b>{copy.relatedDomains}</b>{currentDomain.relatedDomains.join(', ')}</span>
              )}
            </div>
          </div>
        )}
      </section>

      {workspace === '' && (
        <div className="pm-lit-empty-state" data-state="empty">
          <span className="pm-lit-state-icon" aria-hidden="true"><BookOpen size={20} /></span>
          <h2>{copy.noWorkspace}</h2>
          <p>{copy.noWorkspaceDetail}</p>
        </div>
      )}
      {isDomainEmpty && (
        <div className="pm-lit-empty-state" data-state="empty">
          <span className="pm-lit-state-icon" aria-hidden="true"><Database size={20} /></span>
          <h2>{copy.noDomains}</h2>
          <p>{copy.noDomainsDetail}</p>
        </div>
      )}
      {failure !== null && <ErrorNotice failure={failure} copy={copy} onRetry={retryFailure} />}
      {pdfFailure !== null && (
        <ErrorNotice
          failure={pdfFailure}
          copy={copy}
          title={copy.pdfErrorTitle}
          nextStep={copy.pdfErrorNextStep}
        />
      )}
      {warnings.length > 0 && domainsWorkspace === workspace && (
        <div className="pm-lit-warning" role="note">{warnings.join('；')}</div>
      )}
      {selectedOrphans !== null && (
        <section className="pm-lit-orphan-result" aria-label={copy.orphanResults} role="status">
          <div className="pm-lit-orphan-summary">
            <FileText size={16} aria-hidden="true" />
            <strong>{copy.orphanResults}</strong>
            <span className="pm-lit-number">{formatCount(selectedOrphans.total)}</span>
            <span>{copy.orphanFiles}</span>
            <span className="pm-lit-orphan-hint">{copy.orphanHint}</span>
          </div>
          {selectedOrphans.paths.length > 0 && (
            <ul className="pm-lit-orphan-paths">
              {selectedOrphans.paths.slice(0, 5).map(path => <li key={path}>{path}</li>)}
            </ul>
          )}
        </section>
      )}

      {counts !== undefined && hasDomain && (
        <section className="pm-lit-inventory" aria-label={copy.inventory}>
          <h2>{copy.inventory}</h2>
          <dl>
            <div><dt>{copy.papers}</dt><dd>{formatCount(counts.papers)}</dd></div>
            <div><dt>{copy.reports}</dt><dd>{formatCount(counts.reports)}</dd></div>
            <div><dt>{copy.notes}</dt><dd>{formatCount(counts.notes)}</dd></div>
            <div>
              <dt>{copy.vector}</dt>
              <dd>{formatCount(counts.vectors)}</dd>
              <span>{counts.vectors === 0 ? copy.keywordFallback : `${formatCount(counts.chunks)} ${copy.chunks}`}</span>
            </div>
          </dl>
        </section>
      )}

      {hasDomain && (
        <section className="pm-lit-collection" aria-label={copy.collections}>
          <div className="pm-lit-collection-heading">
            <div>
              <p className="pm-lit-section-kicker">{copy.collections}</p>
              <h2>{currentDomain.name}</h2>
            </div>
          </div>
          <div className="pm-lit-collection-toolbar">
            <div className="pm-lit-tabs" role="tablist" aria-label={copy.collections}>
              <button
                type="button"
                id="pm-lit-tab-papers"
                role="tab"
                aria-controls="pm-lit-panel"
                aria-selected={tab === 'papers'}
                tabIndex={tab === 'papers' ? 0 : -1}
                className="pm-lit-tab"
                onClick={() => { setTab('papers'); setKind('') }}
                onKeyDown={moveCollectionTab}
              >
                {copy.papers}<span>{data === null ? '—' : formatCount(data.papers.total)}</span>
              </button>
              <button
                type="button"
                id="pm-lit-tab-notes"
                role="tab"
                aria-controls="pm-lit-panel"
                aria-selected={tab === 'notes'}
                tabIndex={tab === 'notes' ? 0 : -1}
                className="pm-lit-tab"
                onClick={() => { setTab('notes'); setKind('') }}
                onKeyDown={moveCollectionTab}
              >
                {copy.reportsNotes}<span>{data === null ? '—' : formatCount(data.notes.total)}</span>
              </button>
            </div>
            <div className="pm-lit-filters">
              <label className="pm-lit-search">
                <Search size={16} aria-hidden="true" />
                <span className="pm-lit-sr-only">{copy.searchLabel}</span>
                <input
                  data-testid="pm-lit-search"
                  type="search"
                  value={query}
                  placeholder={copy.search}
                  aria-label={copy.searchLabel}
                  onChange={event => setQuery(event.target.value)}
                />
              </label>
              {kindOptions.length > 0 && (
                <label className="pm-lit-kind-filter">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <span className="pm-lit-sr-only">{copy.kind}</span>
                  <select aria-label={copy.kind} value={kind} onChange={event => setKind(event.target.value)}>
                    <option value="">{copy.allKinds}</option>
                    {kindOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div
            className="pm-lit-table-region"
            id="pm-lit-panel"
            role="tabpanel"
            aria-labelledby={`pm-lit-tab-${tab}`}
            tabIndex={0}
            aria-busy={isLoading}
          >
            {data !== null && (
              <div className="pm-lit-results-count" aria-live="polite">
                <span>{formatCount(docs.length)} {copy.documents}</span>
              </div>
            )}
            {showLoading && <LoadingRows copy={copy} />}
            {!showLoading && isLoading && <span className="pm-lit-sr-only" role="status">{copy.loading}</span>}
            {!isLoading && data !== null && rows.length === 0 && (
              <div className="pm-lit-empty-state pm-lit-collection-empty" data-state="empty">
                <span className="pm-lit-state-icon" aria-hidden="true"><FileText size={20} /></span>
                <h3>{copy.empty}</h3>
                <p>{copy.emptyDetail}</p>
              </div>
            )}
            {!isLoading && data !== null && rows.length > 0 && docs.length === 0 && (
              <div className="pm-lit-empty-state pm-lit-collection-empty" data-state="filtered-empty">
                <span className="pm-lit-state-icon" aria-hidden="true"><Search size={20} /></span>
                <h3>{copy.noMatches}</h3>
                <button type="button" className="pm-lit-text-button" onClick={clearFilters}>{copy.clearFilters}</button>
              </div>
            )}
            {!isLoading && data !== null && docs.length > 0 && (
              <div className="pm-lit-table-wrap">
                <table className="pm-lit-table" data-testid="pm-lit-table">
                  <caption className="pm-lit-sr-only">{copy.collections} — {tab === 'papers' ? copy.papers : copy.reportsNotes}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.documentTitle}</th>
                      <th scope="col">{copy.year}</th>
                      <th scope="col">{copy.doi}</th>
                      <th scope="col">{copy.type}</th>
                      <th scope="col">{copy.chunks}</th>
                      <th scope="col"><span className="pm-lit-sr-only">{copy.open}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(doc => (
                      <tr key={`${doc.id}-${doc.path}`}>
                        <td data-label={copy.documentTitle}>
                          <div className="pm-lit-doc-title">{safe(doc.title) || doc.path.split(/[\\/]/u).pop() || doc.path}</div>
                          <div className="pm-lit-muted" title={doc.path}>{doc.path}</div>
                        </td>
                        <td data-label={copy.year} className="pm-lit-number">{doc.year ?? '—'}</td>
                        <td data-label={copy.doi} className="pm-lit-doi">{doc.doi ?? '—'}</td>
                        <td data-label={copy.type}><span className="pm-lit-kind">{doc.kind}</span></td>
                        <td data-label={copy.chunks} className="pm-lit-number">{formatCount(doc.chunks)}</td>
                        <td data-label={copy.open}>
                          <button type="button" className="pm-lit-button pm-lit-open" onClick={() => open(doc)}>
                            {copy.open}<ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
      {!hasDomain && hasWorkspace && !isDomainEmpty && failure?.stage !== 'domains' && showDomainLoading && (
        <LoadingRows copy={copy} />
      )}
      <p className="pm-lit-orphan-note"><FileText size={14} aria-hidden="true" />{copy.orphanHint}</p>
    </section>
  )
}
