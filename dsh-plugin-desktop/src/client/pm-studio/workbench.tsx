/** Stable project overview and evidence inspector, exposed as a main panel and dock dialog. */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, FlaskConical, FolderOpen, LayoutDashboard, Network, RefreshCw, ShieldAlert, ShieldCheck, Wrench, X } from 'lucide-react'
import type { PmLocaleFace } from './copy.ts'
import { pmWorkbenchCopy, type PmWorkbenchCopy } from './workbench-copy.ts'

interface PmProjectSummary {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly domain: string
}

interface PmEvidenceRow {
  readonly id: string
  readonly claimSupport: string
  readonly polarity: 'supports' | 'refutes' | 'neutral'
  readonly strength: 'strong' | 'moderate' | 'weak'
  readonly sourceRef: { readonly type: string; readonly ref: string }
  readonly hash: string
  readonly recordedAt: string
  readonly observationId?: string
  readonly payload?: Readonly<Record<string, unknown>>
}

interface PmHypothesisRow {
  readonly id: string
  readonly statement: string
  readonly status: string
  readonly competitors: readonly string[]
  readonly transitions: readonly { readonly to: string; readonly rationale: string; readonly at: string; readonly evidenceIds?: readonly string[] }[]
  readonly evidenceIds?: readonly string[]
}

interface PmNode { readonly id: string; readonly name: string; readonly type: string; readonly symbol?: string; readonly unit?: string }
interface PmEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly relation: string
  readonly applicability: string
  readonly equation?: string
  readonly evidenceIds: readonly string[]
}
interface PmCardRow {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly status: string
  readonly kind: string
  readonly links?: { readonly evidenceIds?: readonly string[] }
}

// A display projection of GET /pm/projects/:id/state, not a write model.
interface PmProjectState {
  readonly project: PmProjectSummary & { readonly question?: string; readonly createdAt?: string }
  readonly evidence: readonly PmEvidenceRow[]
  readonly hypotheses: readonly PmHypothesisRow[]
  readonly mechanism: { readonly nodes: readonly PmNode[]; readonly edges: readonly PmEdge[] }
  readonly knowledge: readonly PmCardRow[]
  readonly ledger: { readonly verified: boolean; readonly chainLength: number; readonly brokenAt?: string }
}
interface PmEnvelope<T> {
  readonly ok: boolean
  readonly data?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

type TabId = keyof PmWorkbenchCopy['tabs']
type Locale = string | PmLocaleFace
interface LoadError { readonly code: string; readonly message?: string }
type LoadResult<T> = { readonly data: T } | { readonly error: LoadError }

const TABS = Object.freeze({
  overview: LayoutDashboard, evidence: ShieldCheck, hypotheses: FlaskConical,
  mechanism: Network, knowledge: BookOpen, tools: Wrench,
} satisfies Record<TabId, typeof Network>)
const TAB_ORDER = Object.freeze(['overview', 'evidence', 'hypotheses', 'mechanism', 'knowledge', 'tools'] as const)
const WORKFLOW = Object.freeze(['evidence', 'hypotheses', 'mechanism'] as const)
const TOOL_GROUPS = Object.freeze([
  'pm_literature_search / screen / download / read / extract · kb_* · Zotero',
  'pm_waxs_analyze / pm_ftir_analyze / pm_saxs_analyze / pm_hermans_analyze / pm_model_fit',
  'pm_sim_chain_mechanics / rubber_elasticity / viscoelastic / chain_stats / crystallization / flory_huggins / tg_blend / diffusion / md_run',
  'pm_mechanism_query / propose_edge / import_seed · pm_hypothesis_propose / transition · pm_gate_check',
  'pm_knowledge_propose / review',
] as const)
const skipSubscribe = () => () => {}

function useCopy(locale: Locale | undefined): PmWorkbenchCopy {
  const face = typeof locale === 'object' ? locale : undefined
  const getSnapshot = face?.getSnapshot ?? (() => typeof locale === 'string' ? locale : 'zh')
  return pmWorkbenchCopy(useSyncExternalStore(face?.subscribe ?? skipSubscribe, getSnapshot, getSnapshot))
}

async function readEnvelope<T>(path: string): Promise<LoadResult<T>> {
  let response: Response
  try {
    response = await fetch(path, { cache: 'no-store', headers: { accept: 'application/json' } })
  } catch {
    return { error: { code: 'NETWORK' } }
  }
  try {
    const payload = await response.json() as PmEnvelope<T> | null
    if (response.ok && payload?.ok === true && payload.data !== undefined) return { data: payload.data }
    return { error: {
      code: payload?.error?.code ?? (response.ok ? 'INVALID_RESPONSE' : `HTTP ${response.status}`),
      ...(payload?.error?.message === undefined ? {} : { message: payload.error.message }),
    } }
  } catch {
    return { error: { code: response.ok ? 'INVALID_RESPONSE' : `HTTP ${response.status}` } }
  }
}

function localize(labels: Readonly<Record<string, string>>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value]! : value
}

function doiLink(source: PmEvidenceRow['sourceRef']): string | undefined {
  if (source.type !== 'doi') return undefined
  const parts = source.ref.trim().replace(/^(?:https:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, '').split('/')
  if (!/^10\.\d{4,}$/u.test(parts[0] ?? '') || parts.length < 2 || parts.some(part => part === '' || part === '.' || part === '..')) return undefined
  return `https://doi.org/${parts.map(part => encodeURIComponent(part.toWellFormed())).join('/')}`
}

/** Injection handed to the conversation dock workbench launcher. */
export interface PmWorkbenchInjected {
  /** Fill and focus the composer draft without sending; false if it is unavailable. */
  readonly applyPrompt: (text: string) => boolean
  readonly locale?: Locale
}

/** Inputs for the keyed main research surface, independent of a retained composer. */
export interface PmResearchDeskProps {
  readonly applyPrompt?: PmWorkbenchInjected['applyPrompt']
  readonly locale?: Locale
  /** Opening section on mount; defaults to the project overview. */
  readonly initialTab?: TabId
  /** Called only when the composer adapter reports a successfully staged draft. */
  readonly onPromptApplied?: () => void
  /** Navigate back to the conversation without changing its draft. */
  readonly onOpenConversation?: () => void
}

/** Render a read-only project desk as a keyed main panel.
 * @param props - Optional composer or navigation actions and the active locale.
 */
export function PmResearchDesk(props: PmResearchDeskProps) {
  return <ResearchDesk {...props} active />
}

interface DeskProps extends PmResearchDeskProps {
  readonly active: boolean
  readonly activation?: number
  readonly onClose?: () => void
  readonly closeRef?: React.Ref<HTMLButtonElement>
}

function ResearchDesk({ active, activation = 0, applyPrompt, locale, initialTab = 'overview', onPromptApplied, onOpenConversation, onClose, closeRef }: DeskProps) {
  const copy = useCopy(locale)
  const [version, setVersion] = useState(0)
  const request = `${activation}:${version}`
  const [preferredProject, setPreferredProject] = useState('')
  const [tab, setTab] = useState<TabId>(initialTab)
  const [evidenceId, setEvidenceId] = useState<string>()
  const [draftStatus, setDraftStatus] = useState<'staged' | 'unavailable'>()
  const [list, setList] = useState<{ readonly request: string; readonly result: LoadResult<{ readonly projects: readonly PmProjectSummary[] }> }>()
  const [project, setProject] = useState<{ readonly request: string; readonly id: string; readonly result: LoadResult<PmProjectState> }>()
  const focusContent = useRef(false)
  const contentRef = useRef<HTMLElement>(null)
  const headingId = useId()

  const currentList = list?.request === request ? list.result : undefined
  const projects = currentList !== undefined && 'data' in currentList ? currentList.data.projects : []
  const currentProject = projects.find(item => item.id === preferredProject) ?? projects[0]
  const projectId = currentProject?.id
  const result = project !== undefined && project.request === request && project.id === projectId ? project.result : undefined
  const state = result !== undefined && 'data' in result ? result.data : undefined
  const error = currentList !== undefined && 'error' in currentList ? currentList.error : result !== undefined && 'error' in result ? result.error : undefined
  const loading = active && (currentList === undefined || (projectId !== undefined && result === undefined))
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (!active) { setDraftStatus(undefined); return }
    let current = true
    void readEnvelope<{ readonly projects: readonly PmProjectSummary[] }>('/pm/projects').then(result => {
      if (!current) return
      setList({ request, result })
      if ('data' in result) {
        setPreferredProject(preferred => result.data.projects.some(item => item.id === preferred) ? preferred : (result.data.projects[0]?.id ?? ''))
      }
    })
    return () => { current = false }
  }, [active, request])

  useEffect(() => {
    if (!active || projectId === undefined) return
    let current = true
    void readEnvelope<PmProjectState>(`/pm/projects/${encodeURIComponent(projectId)}/state`).then(result => {
      if (current) setProject({ request, id: projectId, result })
    })
    return () => { current = false }
  }, [active, request, projectId])

  useEffect(() => {
    if (!loading) { setShowLoading(false); return }
    const timer = setTimeout(() => { setShowLoading(true) }, 400)
    return () => { clearTimeout(timer) }
  }, [loading])

  useEffect(() => {
    const content = contentRef.current
    if (content !== null) content.scrollTop = 0
    if (focusContent.current) {
      focusContent.current = false
      content?.focus()
    }
  }, [tab, projectId])

  const refresh = () => { setVersion(current => current + 1) }
  const stage = applyPrompt === undefined ? undefined : (text: string) => {
    if (!applyPrompt(text)) { setDraftStatus('unavailable'); return }
    setDraftStatus('staged')
    onPromptApplied?.()
  }
  const navigate = (id: TabId) => {
    focusContent.current = true
    setTab(id)
  }
  const inspectEvidence = (id: string) => {
    setEvidenceId(id)
    navigate('evidence')
  }
  const counts = state === undefined ? undefined : {
    evidence: state.evidence.length, hypotheses: state.hypotheses.length,
    mechanism: state.mechanism.edges.length,
  }
  const unresolved = state?.hypotheses.filter(row => row.status === 'proposed' || row.status === 'conditional' || row.status === 'under_test').length

  return (
    <section className="dshDesktopPmWbDesk" aria-labelledby={headingId}>
      <header className="dshDesktopPmWbToolbar">
        <h2 id={headingId}><Network size={16} aria-hidden="true" />{copy.title}</h2>
        <div className="dshDesktopPmWbControls">
          <select aria-label={copy.projectSelect} value={projectId ?? ''} disabled={projects.length === 0} onChange={event => {
            setPreferredProject(event.target.value)
            setProject(undefined)
            setEvidenceId(undefined)
          }}>
            {projects.length === 0 ? <option value="">{loading ? copy.loading : error ? copy.projectSelect : copy.noProjects}</option> : null}
            {projects.map(item => <option key={item.id} value={item.id}>{item.title} · {item.id}</option>)}
          </select>
          <button type="button" onClick={refresh} title={copy.refresh} aria-label={copy.refresh}><RefreshCw size={15} aria-hidden="true" /></button>
          {onOpenConversation !== undefined ? (
            <button type="button" onClick={onOpenConversation}><ArrowLeft size={15} aria-hidden="true" />{copy.openConversation}</button>
          ) : null}
          {onClose !== undefined ? <button ref={closeRef} type="button" onClick={onClose} title={copy.close} aria-label={copy.close}><X size={16} aria-hidden="true" /></button> : null}
        </div>
      </header>

      {state !== undefined && unresolved !== undefined ? (
        <div className="dshDesktopPmWbContext">
          <strong>{state.project.title}</strong>
          <span>{copy.openHypotheses} <b>{unresolved}</b></span>
          <LedgerStatus ledger={state.ledger} copy={copy} />
        </div>
      ) : null}

      <nav className="dshDesktopPmWbTabs" aria-label={copy.sections}>
        {TAB_ORDER.map(id => {
          const Icon = TABS[id]
          const count = id === 'overview' || id === 'tools' || id === 'knowledge' ? undefined : counts?.[id]
          return (
            <button key={id} type="button" aria-label={copy.tabs[id]} aria-pressed={tab === id} onClick={() => { setTab(id) }}>
              <Icon size={15} aria-hidden="true" />{copy.tabs[id]}
              {count !== undefined ? <span aria-hidden="true">{count}</span> : null}
            </button>
          )
        })}
      </nav>

      <section ref={contentRef} className="dshDesktopPmWbBody" tabIndex={-1} aria-label={copy.tabs[tab]} aria-busy={loading}>
        {draftStatus === 'unavailable' ? <p className="dshDesktopPmWbNotice" role="alert">{copy.unavailable}</p> : null}
        {draftStatus === 'staged' && onPromptApplied === undefined ? <p className="dshDesktopPmWbNotice" role="status">{copy.staged}</p> : null}
        {loading && showLoading ? (
          <div className="dshDesktopPmWbLoading" role="status">
            <p>{copy.loading}</p><div aria-hidden="true"><i /><i /><i /></div>
          </div>
        ) : null}
        {error !== undefined ? (
          <div className="dshDesktopPmWbNotice" role="alert">
            <p><code>{error.code}</code> · {copy.loadError}</p>
            {error.message !== undefined ? <p>{error.message}</p> : null}
            <button type="button" onClick={refresh}>{copy.retry}</button>
          </div>
        ) : null}
        {!loading && error === undefined && state === undefined && tab !== 'tools' ? (
          <div className="dshDesktopPmWbNotice">
            <h3>{copy.noProjects}</h3><p>{copy.noProjectsHint}</p>
            {stage !== undefined ? <button type="button" onClick={() => { stage(copy.literaturePrompt) }}><BookOpen size={15} aria-hidden="true" />{copy.literature}</button> : null}
          </div>
        ) : null}

        {state !== undefined && counts !== undefined && unresolved !== undefined && tab === 'overview' ? (
          <div className="dshDesktopPmWbOverview">
            <header className="dshDesktopPmWbHero">
              <p className="dshDesktopPmWbEyebrow"><FolderOpen size={16} aria-hidden="true" />{copy.project}<span aria-hidden="true">/</span><code>{state.project.id}</code></p>
              <h1>{state.project.title}</h1>
              <p>{state.project.question?.trim() || copy.noQuestion}</p>
              <dl className="dshDesktopPmWbMeta">
                <div><dt>{copy.status}</dt><dd>{localize(copy.projectStatuses, state.project.status)}</dd></div>
                <div><dt>{copy.domain}</dt><dd>{state.project.domain}</dd></div>
                {state.project.createdAt ? <div><dt>{copy.created}</dt><dd><RecordedTime value={state.project.createdAt} /></dd></div> : null}
              </dl>
            </header>
            <div className="dshDesktopPmWbColumns">
              <section className="dshDesktopPmWbPanel">
                <header className="dshDesktopPmWbPanelHead"><h3>{copy.workflow}</h3><p>{copy.workflowHint}</p></header>
                <ol className="dshDesktopPmWbWorkflow">
                  {WORKFLOW.map((id, index) => {
                    const Icon = TABS[id]
                    const labels = { evidence: copy.evidenceCount, hypotheses: copy.hypothesisCount, mechanism: copy.mechanismCount }
                    return (
                      <li key={id}>
                        <span className="dshDesktopPmWbStep" aria-hidden="true">{(index + 1).toString().padStart(2, '0')}</span>
                        <button type="button" onClick={() => { navigate(id) }}>
                          <Icon size={16} aria-hidden="true" />
                          <span><strong>{copy.tabs[id]}</strong><small>{counts[id]} {labels[id]}</small></span>
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>
              <aside className="dshDesktopPmWbPanel">
                <header className="dshDesktopPmWbPanelHead"><h3>{copy.inspector}</h3></header>
                <div className="dshDesktopPmWbPanelBody">
                  <div className="dshDesktopPmWbInspection"><LedgerStatus ledger={state.ledger} copy={copy} /><p>{copy.gateNote}</p></div>
                  <dl className="dshDesktopPmWbRecords">
                    <div><dt>{copy.projectId}</dt><dd><code>{state.project.id}</code></dd></div>
                    <div><dt>{copy.ledgerRows}</dt><dd>{state.ledger.chainLength}</dd></div>
                    <div><dt>{copy.openHypotheses}</dt><dd>{unresolved}</dd></div>
                    {!state.ledger.verified ? <div><dt>{copy.brokenAt}</dt><dd>{state.ledger.brokenAt ?? copy.unknownRecord}</dd></div> : null}
                  </dl>
                  {stage !== undefined ? (
                    <div className="dshDesktopPmWbNext">
                      <h4>{copy.next}</h4><p>{copy.draftHint}</p>
                      <div className="dshDesktopPmWbActions">
                        <button type="button" onClick={() => { stage(copy.gapPrompt) }}><ShieldCheck size={15} aria-hidden="true" />{copy.checkGaps}</button>
                        <button type="button" onClick={() => { stage(copy.literaturePrompt) }}><BookOpen size={15} aria-hidden="true" />{copy.literature}</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {state !== undefined && tab === 'evidence' ? (
          <EvidencePane copy={copy} rows={state.evidence} evidenceId={evidenceId} onSelect={setEvidenceId} />
        ) : null}
        {state !== undefined && tab === 'hypotheses' ? (
          <div className="dshDesktopPmWbList">
            {state.hypotheses.length === 0 ? <p className="dshDesktopPmWbNotice">{copy.noHypotheses}</p> : null}
            {state.hypotheses.map(row => (
              <article key={row.id}>
                <header><code>{row.id}</code><span className="dshDesktopPmWbBadge" data-tone={row.status}>{localize(copy.hypothesisStatuses, row.status)}</span></header>
                <p>{row.statement}</p>
                <p className="dshDesktopPmWbMuted">{row.competitors.length > 0 ? `${copy.competitors}: ${row.competitors.join(' · ')}` : copy.noCompetitors}</p>
                <EvidenceLinks state={state} ids={row.evidenceIds} copy={copy} onSelect={inspectEvidence} />
                {row.transitions.length > 0 ? <details>
                  <summary>{copy.transitions}</summary>
                  {row.transitions.map((move, index) => <div key={`${move.at}:${index}`}>
                    <p><strong>{localize(copy.hypothesisStatuses, move.to)}</strong> · {move.rationale}</p>
                    <EvidenceLinks state={state} ids={move.evidenceIds} copy={copy} onSelect={inspectEvidence} />
                  </div>)}
                </details> : null}
              </article>
            ))}
          </div>
        ) : null}
        {state !== undefined && tab === 'mechanism' ? (
          <div className="dshDesktopPmWbColumns">
            <section className="dshDesktopPmWbPanel">
              <header className="dshDesktopPmWbPanelHead"><h3>{copy.nodeCount} · {state.mechanism.nodes.length}</h3></header>
              <div className="dshDesktopPmWbList">
                {state.mechanism.nodes.length === 0 ? <p className="dshDesktopPmWbNotice">{copy.noNodes}</p> : null}
                {state.mechanism.nodes.map(node => <article key={node.id}><strong>{node.name}</strong><p className="dshDesktopPmWbMuted">{[node.type, node.symbol, node.unit].filter(Boolean).join(' · ')}</p></article>)}
              </div>
            </section>
            <section className="dshDesktopPmWbPanel">
              <header className="dshDesktopPmWbPanelHead"><h3>{copy.mechanismCount} · {state.mechanism.edges.length}</h3></header>
              <div className="dshDesktopPmWbList">
                {state.mechanism.edges.length === 0 ? <p className="dshDesktopPmWbNotice">{copy.noEdges}</p> : null}
                {state.mechanism.edges.map(edge => {
                  const nameOf = (id: string) => state.mechanism.nodes.find(node => node.id === id)?.name ?? id
                  return (
                    <article key={edge.id}>
                      <header><span className="dshDesktopPmWbBadge" data-tone={edge.applicability}>{localize(copy.edgeStatuses, edge.applicability)}</span><span>{edge.relation}</span></header>
                      <p>{nameOf(edge.from)} → {nameOf(edge.to)}</p>
                      {edge.equation !== undefined ? <code>{edge.equation}</code> : null}
                      <EvidenceLinks state={state} ids={edge.evidenceIds} copy={copy} onSelect={inspectEvidence} />
                    </article>
                  )
                })}
              </div>
            </section>
          </div>
        ) : null}
        {state !== undefined && tab === 'knowledge' ? (
          <div className="dshDesktopPmWbList">
            <header className="dshDesktopPmWbPanelHead"><h3>{copy.sharedKnowledge}</h3><p>{copy.sharedKnowledgeHint}</p></header>
            {state.knowledge.length === 0 ? <p className="dshDesktopPmWbNotice">{copy.noCards}</p> : null}
            {state.knowledge.map(card => (
              <article key={card.id}>
                <header><code>{card.id}</code><span className="dshDesktopPmWbBadge" data-tone={card.status}>{localize(copy.cardStatuses, card.status)}</span><span>{card.kind}</span></header>
                <h3>{card.title}</h3><p>{card.body}</p>
                <EvidenceLinks state={state} ids={card.links?.evidenceIds} copy={copy} onSelect={inspectEvidence} />
              </article>
            ))}
          </div>
        ) : null}
        {tab === 'tools' ? (
          <section className="dshDesktopPmWbPanel">
            <header className="dshDesktopPmWbPanelHead"><h3>{copy.toolsHeading}</h3></header>
            <dl className="dshDesktopPmWbToolList">
              {TOOL_GROUPS.map((tools, index) => <div key={tools}><dt>{copy.toolGroups[index]}</dt><dd><code>{tools}</code></dd></div>)}
            </dl>
          </section>
        ) : null}
      </section>
    </section>
  )
}

function LedgerStatus({ ledger, copy }: { readonly ledger: PmProjectState['ledger']; readonly copy: PmWorkbenchCopy }) {
  const Icon = ledger.verified ? ShieldCheck : ShieldAlert
  return <span className="dshDesktopPmWbBadge" data-tone={ledger.verified ? 'supports' : 'refutes'}><Icon size={14} aria-hidden="true" />{ledger.verified ? copy.ledgerVerified : copy.ledgerBroken}</span>
}

function RecordedTime({ value }: { readonly value: string }) {
  return <time dateTime={value}>{value}</time>
}

function EvidenceLinks({ state, ids = [], copy, onSelect }: {
  readonly state: PmProjectState
  readonly ids?: readonly string[] | undefined
  readonly copy: PmWorkbenchCopy
  readonly onSelect: (id: string) => void
}) {
  if (ids.length === 0) return null
  const available = new Set(state.evidence.map(row => row.id))
  return (
    <div className="dshDesktopPmWbActions">
      <span>{copy.boundEvidence}</span>
      {[...new Set(ids)].map(id => available.has(id)
        ? <button key={id} type="button" onClick={() => { onSelect(id) }}><code>{id}</code></button>
        : <code key={id}>{id} · {copy.missingEvidence}</code>)}
    </div>
  )
}

function EvidencePane({ copy, rows, evidenceId, onSelect }: {
  readonly copy: PmWorkbenchCopy
  readonly rows: readonly PmEvidenceRow[]
  readonly evidenceId: string | undefined
  readonly onSelect: (id: string) => void
}) {
  const dataHeading = useId()
  const inspectorHeading = useId()
  const inspectorId = useId()
  const inspectorRef = useRef<HTMLElement>(null)
  const selected = rows.find(row => row.id === evidenceId) ?? rows[0]
  const doi = selected === undefined ? undefined : doiLink(selected.sourceRef)
  return (
    <div className="dshDesktopPmWbColumns">
      <section className="dshDesktopPmWbPanel" aria-labelledby={dataHeading}>
        <header className="dshDesktopPmWbPanelHead"><h3 id={dataHeading}>{copy.dataHeading} · {rows.length}</h3><p>{copy.dataHint}</p></header>
        {rows.length === 0 ? <p className="dshDesktopPmWbNotice">{copy.noEvidence}</p> : (
          <table className="dshDesktopPmWbTable" aria-labelledby={dataHeading}>
            <thead><tr><th scope="col">{copy.entryId}</th><th scope="col">{copy.claim}</th><th scope="col">{copy.polarity}</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} data-selected={row.id === selected?.id}>
                  <th scope="row"><button type="button" aria-pressed={row.id === selected?.id} aria-controls={inspectorId} onClick={() => {
                    onSelect(row.id)
                    // Keep the inline inspector discoverable when the two columns stack.
                    inspectorRef.current?.focus()
                  }}><code>{row.id}</code></button></th>
                  <td>{row.claimSupport}</td>
                  <td><span className="dshDesktopPmWbBadge" data-tone={row.polarity}>{copy.polarities[row.polarity]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <aside ref={inspectorRef} tabIndex={-1} id={inspectorId} className="dshDesktopPmWbPanel" aria-labelledby={inspectorHeading}>
        <header className="dshDesktopPmWbPanelHead"><h3 id={inspectorHeading}>{copy.evidenceDetail}</h3></header>
        <div className="dshDesktopPmWbPanelBody">
          {selected === undefined ? <p>{copy.selectEvidence}</p> : (
            <>
              <p className="dshDesktopPmWbEyebrow"><code>{selected.id}</code><span className="dshDesktopPmWbBadge" data-tone={selected.polarity}>{copy.polarities[selected.polarity]}</span></p>
              <p className="dshDesktopPmWbClaim">{selected.claimSupport}</p>
              <dl className="dshDesktopPmWbRecords">
                <div><dt>{copy.strength}</dt><dd>{copy.strengths[selected.strength]}</dd></div>
                <div><dt>{copy.source}</dt><dd>{localize(copy.sourceTypes, selected.sourceRef.type)} · <code>{selected.sourceRef.ref}</code></dd></div>
                {selected.observationId !== undefined ? <div><dt>{copy.observation}</dt><dd><code>{selected.observationId}</code></dd></div> : null}
                <div><dt>{copy.recordTime}</dt><dd><RecordedTime value={selected.recordedAt} /></dd></div>
                <div><dt>{copy.hash}</dt><dd><code>{selected.hash}</code></dd></div>
              </dl>
              {selected.payload !== undefined ? <details className="dshDesktopPmWbPayload"><summary>{copy.payload}</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details> : null}
              {doi !== undefined ? <a href={doi} target="_blank" rel="noopener noreferrer">{copy.openDoi}<ExternalLink size={13} aria-hidden="true" /></a> : <p className="dshDesktopPmWbMuted">{copy.sourceReferenceOnly}</p>}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function showDialog(dialog: HTMLDialogElement) {
  if (dialog.open) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

function hideDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}

/** Render the existing conversation dock launcher and modal desk.
 * @param props - Composer draft adapter and optional live locale.
 */
export function PmWorkbench({ applyPrompt, locale }: PmWorkbenchInjected) {
  const copy = useCopy(locale)
  const [open, setOpen] = useState(false)
  const [activation, setActivation] = useState(0)
  const launched = activation > 0
  const launcher = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const dialogId = useId()

  useEffect(() => {
    if (open && dialog.current !== null) {
      showDialog(dialog.current)
      close.current?.focus()
    }
  }, [open])

  const dismiss = useCallback(() => {
    if (dialog.current !== null) hideDialog(dialog.current)
    setOpen(false)
    launcher.current?.focus()
  }, [])

  const stage = (text: string) => {
    const element = dialog.current
    if (element === null) return false
    const previousFocus = document.activeElement
    // A native modal makes the composer inert. Close synchronously before the
    // adapter sets and focuses its draft; reopen only if the adapter cannot stage it.
    hideDialog(element)
    if (applyPrompt(text)) return true
    showDialog(element)
    if (previousFocus instanceof HTMLElement && element.contains(previousFocus)) previousFocus.focus()
    else close.current?.focus()
    return false
  }

  return (
    <div className="dshDesktopPmWbLauncher">
      <button ref={launcher} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={launched ? dialogId : undefined} onClick={() => {
        setActivation(current => current + 1)
        setOpen(true)
      }}><Network size={14} aria-hidden="true" />{copy.title}</button>
      <span>{copy.launcherHint}</span>
      {launched && typeof document !== 'undefined' ? createPortal(
        <dialog id={dialogId} ref={dialog} className="dshDesktopPmWbDialog" aria-label={copy.title} role={open ? 'dialog' : undefined} aria-modal={open || undefined} onCancel={event => {
          event.preventDefault()
          dismiss()
        }} onKeyDown={event => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            event.stopPropagation()
            dismiss()
          }
        }}>
          <ResearchDesk active={open} activation={activation} {...(locale === undefined ? {} : { locale })} applyPrompt={stage} onClose={dismiss} closeRef={close} onPromptApplied={() => { setOpen(false) }} />
        </dialog>, document.body,
      ) : null}
    </div>
  )
}
