/**
 * PolyMechanism research workbench: a read-only window onto the Host's project
 * state (ledger, hypotheses, mechanism graph, knowledge cards) plus one-click
 * literature actions that hand a prepared prompt to the composer.
 *
 * The overlay is rendered through a portal so the dock above the composer only
 * carries a slim launcher. Copy is zh-first to match the studio console; the
 * labels stay inside this module until the l10n pass moves them into copy.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, FlaskConical, GitBranch, Network, RefreshCw, ShieldCheck, X } from 'lucide-react'

/** One project row from GET /pm/projects. */
interface PmProjectSummary {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly domain: string
}

/** One evidence row as rendered by the workbench. */
interface PmEvidenceRow {
  readonly id: string
  readonly claimSupport: string
  readonly polarity: 'supports' | 'refutes' | 'neutral'
  readonly strength: 'strong' | 'moderate' | 'weak'
  readonly sourceRef: { readonly type: string; readonly ref: string }
  readonly hash: string
  readonly recordedAt: string
}

/** One hypothesis row. */
interface PmHypothesisRow {
  readonly id: string
  readonly statement: string
  readonly status: string
  readonly competitors: readonly string[]
  readonly transitions: readonly { readonly to: string; readonly rationale: string; readonly at: string }[]
}

/** One mechanism node / edge. */
interface PmNode { readonly id: string; readonly name: string; readonly type: string; readonly symbol?: string; readonly unit?: string }
interface PmEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly relation: string
  readonly applicability: string
  readonly confidence: number
  readonly equation?: string
  readonly evidenceIds: readonly string[]
}

/** One knowledge card. */
interface PmCardRow { readonly id: string; readonly title: string; readonly body: string; readonly status: string; readonly kind: string }

/** Aggregated project state from GET /pm/projects/:id/state. */
interface PmProjectState {
  readonly project: PmProjectSummary & { readonly question?: string; readonly createdAt?: string }
  readonly evidence: readonly PmEvidenceRow[]
  readonly hypotheses: readonly PmHypothesisRow[]
  readonly mechanism: { readonly nodes: readonly PmNode[]; readonly edges: readonly PmEdge[] }
  readonly knowledge: readonly PmCardRow[]
  readonly ledger: { readonly verified: boolean; readonly chainLength: number; readonly brokenAt?: string }
}

/** Envelope shared by every pm route. */
interface PmEnvelope<T> { readonly ok: boolean; readonly data?: T; readonly error?: { readonly message?: string } }

type TabId = 'overview' | 'evidence' | 'hypotheses' | 'mechanism' | 'knowledge' | 'tools'

const TABS: readonly { readonly id: TabId; readonly label: string; readonly Icon: typeof BookOpen }[] = [
  { id: 'overview', label: '概览', Icon: ShieldCheck },
  { id: 'evidence', label: '证据', Icon: FlaskConical },
  { id: 'hypotheses', label: '假设', Icon: GitBranch },
  { id: 'mechanism', label: '机理', Icon: Network },
  { id: 'knowledge', label: '知识', Icon: BookOpen },
  { id: 'tools', label: '工具', Icon: FlaskConical },
]

const LITERATURE_PROMPT = [
  '请作为文献专家完成一次文献作业：',
  '1) 用 pm_literature_search 检索我的课题关键词（高分子、双轴拉伸、取向、双折射、WAXS/FTIR/SAXS 任一相关方向）；',
  '2) 对 core/important 候选读摘要做终审（accept / review / reject + 理由）；',
  '3) 用 pm_literature_download 下载选中的 PDF（机构网络内合法访问），失败的给出 DOI 直链；',
  '4) 精读后用 pm_literature_extract 把测量类结论登记为证据（区分“论文测量的”与“论文解释的”）；',
  '5) 汇总成一张证据表并说明缺口。',
].join('\n')

async function readEnvelope<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', headers: { accept: 'application/json' } })
  const payload = await response.json() as PmEnvelope<T>
  if (!response.ok || payload.ok !== true || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `HTTP ${String(response.status)}`)
  }
  return payload.data
}

function polarityLabel(value: PmEvidenceRow['polarity']): string {
  return value === 'supports' ? '支持' : value === 'refutes' ? '反驳' : '中性'
}

function strengthLabel(value: PmEvidenceRow['strength']): string {
  return value === 'strong' ? '强' : value === 'moderate' ? '中' : '弱'
}

/** Injection handed to the workbench registration. */
export interface PmWorkbenchInjected {
  /** Fill the composer draft and focus it; false when the composer is not ready. */
  applyPrompt(text: string): boolean
}

/** Slim launcher row plus the portal overlay. */
export function PmWorkbench(props: PmWorkbenchInjected) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<readonly PmProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [state, setState] = useState<PmProjectState | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const data = await readEnvelope<{ projects: readonly PmProjectSummary[] }>('/pm/projects')
      setProjects(data.projects)
      setProjectId(current => data.projects.some(item => item.id === current) ? current : (data.projects[0]?.id ?? ''))
      setStatus('ready')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const loadState = useCallback(async (id: string) => {
    if (id === '') { setState(null); return }
    setStatus('loading')
    setError('')
    try {
      setState(await readEnvelope<PmProjectState>(`/pm/projects/${encodeURIComponent(id)}/state`))
      setStatus('ready')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadProjects()
  }, [open, loadProjects])

  useEffect(() => {
    if (!open) return
    void loadState(projectId)
  }, [open, projectId, loadState])

  const refresh = useCallback(() => {
    void loadProjects()
    void loadState(projectId)
  }, [loadProjects, loadState, projectId])

  const counts = useMemo(() => ({
    evidence: state?.evidence.length ?? 0,
    hypotheses: state?.hypotheses.length ?? 0,
    nodes: state?.mechanism.nodes.length ?? 0,
    edges: state?.mechanism.edges.length ?? 0,
    cards: state?.knowledge.length ?? 0,
  }), [state])

  const nameOf = useCallback((id: string) => {
    return state?.mechanism.nodes.find(node => node.id === id)?.name ?? id
  }, [state])

  const startLiterature = useCallback(() => {
    if (!props.applyPrompt(LITERATURE_PROMPT)) {
      setError('输入框尚未就绪，请在会话输入框中重试')
      return
    }
    setOpen(false)
  }, [props.applyPrompt])

  const overlay = open && typeof document !== 'undefined'
    ? createPortal(
      <div className="pm-wb-backdrop" role="dialog" aria-modal="true" aria-label="研究工作台">
        <div className="pm-wb">
          <header className="pm-wb-head">
            <div className="pm-wb-title">
              <Network size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>研究工作台</span>
            </div>
            <div className="pm-wb-head-actions">
              <select
                className="pm-wb-select"
                value={projectId}
                aria-label="选择项目"
                onChange={(event) => { setProjectId(event.target.value) }}
              >
                {projects.length === 0 ? <option value="">暂无项目</option> : null}
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.title}（{project.id}）</option>
                ))}
              </select>
              <button type="button" className="pm-wb-icon" onClick={refresh} title="刷新" aria-label="刷新">
                <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button type="button" className="pm-wb-icon" onClick={() => { setOpen(false) }} title="关闭" aria-label="关闭">
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </header>

          <nav className="pm-wb-tabs" aria-label="工作台分区">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className="pm-wb-tab"
                aria-pressed={tab === id}
                onClick={() => { setTab(id) }}
              >
                <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
                {label}
                {id === 'evidence' ? <em>{counts.evidence}</em> : null}
                {id === 'hypotheses' ? <em>{counts.hypotheses}</em> : null}
                {id === 'mechanism' ? <em>{counts.edges}</em> : null}
                {id === 'knowledge' ? <em>{counts.cards}</em> : null}
              </button>
            ))}
          </nav>

          <div className="pm-wb-body">
            {status === 'loading' && state === null ? <p className="pm-wb-note">正在读取项目状态…</p> : null}
            {error !== '' ? <p className="pm-wb-note pm-wb-error">{error}</p> : null}
            {status !== 'loading' && state === null && error === '' ? (
              <p className="pm-wb-note">还没有项目。先在会话里让科研总控用 pm_project_create 建一个项目，或直接开始文献作业。</p>
            ) : null}

            {state !== null && tab === 'overview' ? (
              <section className="pm-wb-grid">
                <article className="pm-wb-card">
                  <h3>{state.project.title}</h3>
                  <p className="pm-wb-sub">{state.project.question ?? '未填写研究问题'} · {state.project.domain}</p>
                  <dl className="pm-wb-stats">
                    <div><dt>证据</dt><dd>{counts.evidence}</dd></div>
                    <div><dt>假设</dt><dd>{counts.hypotheses}</dd></div>
                    <div><dt>机理节点</dt><dd>{counts.nodes}</dd></div>
                    <div><dt>机理边</dt><dd>{counts.edges}</dd></div>
                    <div><dt>知识卡</dt><dd>{counts.cards}</dd></div>
                  </dl>
                  <p className={state.ledger.verified ? 'pm-wb-badge pm-wb-ok' : 'pm-wb-badge pm-wb-bad'}>
                    {state.ledger.verified
                      ? `证据链校验通过（${state.ledger.chainLength} 条，prevHash 逐条链接）`
                      : `证据链断裂于 ${state.ledger.brokenAt ?? '未知记录'} — 请勿引用`}
                  </p>
                </article>
                <article className="pm-wb-card">
                  <h3>下一步</h3>
                  <p className="pm-wb-sub">把工作台结论交给专家，或直接启动一次文献作业。</p>
                  <div className="pm-wb-actions">
                    <button type="button" className="pm-wb-primary" onClick={startLiterature}>
                      <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                      让文献专家开始检索
                    </button>
                    <button type="button" className="pm-wb-secondary" onClick={() => { props.applyPrompt('检查当前项目的证据链与科学门控，列出缺口并给出补证计划。'); setOpen(false) }}>
                      检查证据缺口
                    </button>
                  </div>
                </article>
              </section>
            ) : null}

            {state !== null && tab === 'evidence' ? (
              <section className="pm-wb-list">
                {state.evidence.length === 0 ? <p className="pm-wb-note">尚无证据记录。</p> : null}
                {state.evidence.map(row => (
                  <article key={row.id} className="pm-wb-row">
                    <div className="pm-wb-row-head">
                      <code>{row.id}</code>
                      <span className={`pm-wb-chip pm-wb-${row.polarity}`}>{polarityLabel(row.polarity)}</span>
                      <span className="pm-wb-chip">{strengthLabel(row.strength)}</span>
                      <span className="pm-wb-muted">{row.sourceRef.type}: {row.sourceRef.ref}</span>
                    </div>
                    <p>{row.claimSupport}</p>
                    <p className="pm-wb-muted">hash {row.hash.slice(0, 12)}… · {row.recordedAt}</p>
                  </article>
                ))}
              </section>
            ) : null}

            {state !== null && tab === 'hypotheses' ? (
              <section className="pm-wb-list">
                {state.hypotheses.length === 0 ? <p className="pm-wb-note">尚无假设。</p> : null}
                {state.hypotheses.map(row => (
                  <article key={row.id} className="pm-wb-row">
                    <div className="pm-wb-row-head">
                      <code>{row.id}</code>
                      <span className={`pm-wb-chip pm-wb-status-${row.status}`}>{row.status}</span>
                    </div>
                    <p>{row.statement}</p>
                    {row.competitors.length > 0 ? (
                      <p className="pm-wb-muted">竞争假设：{row.competitors.join('；')}</p>
                    ) : (
                      <p className="pm-wb-muted">未声明竞争假设 — 科学门控会在结论阶段阻断。</p>
                    )}
                    {row.transitions.length > 0 ? (
                      <p className="pm-wb-muted">
                        轨迹：{row.transitions.map(move => `→ ${move.to}`).join(' ')}
                      </p>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}

            {state !== null && tab === 'mechanism' ? (
              <section className="pm-wb-split">
                <div>
                  <h3 className="pm-wb-h3">节点 {counts.nodes}</h3>
                  <ul className="pm-wb-nodes">
                    {state.mechanism.nodes.map(node => (
                      <li key={node.id}>
                        <span className="pm-wb-muted">{node.type}</span>
                        <span>{node.name}</span>
                        {node.symbol !== undefined ? <code>{node.symbol}</code> : null}
                        {node.unit !== undefined ? <em>{node.unit}</em> : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="pm-wb-h3">边 {counts.edges}</h3>
                  <ul className="pm-wb-edges">
                    {state.mechanism.edges.map(edge => (
                      <li key={edge.id}>
                        <div className="pm-wb-row-head">
                          <span className={`pm-wb-chip pm-wb-${edge.applicability}`}>{edge.applicability}</span>
                          <span className="pm-wb-muted">{edge.relation}</span>
                          <span className="pm-wb-muted">证据 {edge.evidenceIds.length}</span>
                        </div>
                        <p>{nameOf(edge.from)} → {nameOf(edge.to)}</p>
                        {edge.equation !== undefined ? <code className="pm-wb-eq">{edge.equation}</code> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {state !== null && tab === 'knowledge' ? (
              <section className="pm-wb-list">
                {state.knowledge.length === 0 ? <p className="pm-wb-note">尚无知识卡。</p> : null}
                {state.knowledge.map(card => (
                  <article key={card.id} className="pm-wb-row">
                    <div className="pm-wb-row-head">
                      <code>{card.id}</code>
                      <span className={`pm-wb-chip pm-wb-card-${card.status}`}>{card.status}</span>
                      <span className="pm-wb-muted">{card.kind}</span>
                    </div>
                    <p><strong>{card.title}</strong> — {card.body}</p>
                  </article>
                ))}
              </section>
            ) : null}

            {tab === 'tools' ? (
              <section className="pm-wb-list">
                <article className="pm-wb-row">
                  <h3 className="pm-wb-h3">已接入的科研能力</h3>
                  <ul className="pm-wb-capabilities">
                    <li><b>文献</b> pm_literature_search / screen / download / read / extract + kb_*（本地知识库）+ Zotero skill</li>
                    <li><b>表征</b> pm_waxs_analyze / pm_ftir_analyze / pm_saxs_analyze / pm_hermans_analyze / pm_model_fit</li>
                    <li><b>仿真</b> pm_sim_chain_mechanics / rubber_elasticity / viscoelastic / chain_stats / crystallization / flory_huggins / tg_blend / diffusion / md_run</li>
                    <li><b>机理</b> pm_mechanism_query / propose_edge / import_seed + pm_hypothesis_propose / transition + pm_gate_check</li>
                    <li><b>知识</b> pm_knowledge_propose / review（RSI 沉淀，reviewer 审批）</li>
                  </ul>
                </article>
              </section>
            ) : null}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div className="pm-wb-launcher">
        <button type="button" className="pm-wb-open" onClick={() => { setOpen(true) }}>
          <Network size={13} strokeWidth={1.75} aria-hidden="true" />
          研究工作台
        </button>
        <span className="pm-wb-launcher-hint">
          证据链 · 假设 · 机理图谱 · 知识卡
        </span>
      </div>
      {overlay}
    </>
  )
}
