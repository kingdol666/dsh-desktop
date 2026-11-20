/** Research engine facade: per-project stores rooted at one data root. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EvidenceLedger,
  HypothesisStore,
  ProjectStore,
  KnowledgeStore,
  MechanismGraph,
  evaluateGate,
  type GateInput,
  type GateVerdict,
  type RecordEvidenceInput,
} from '@polymechanism/pm-core'
import { resolveScienceRuntime } from './science.ts'
import type {
  DiscriminatingTest,
  EntityId,
  Evidence,
  Hypothesis,
  MechanismEdge,
  MechanismNode,
  ResearchProject,
} from '@polymechanism/pm-domain'

/** Config accepted by the pm-research plugin row. */
export interface PmResearchConfig {
  /** Absolute data root; defaults to `$DSH_HOME/pm`. */
  readonly dataRoot?: string
}

/** Resolve the plugin data root from config and environment. */
export function resolvePmDataRoot(config: PmResearchConfig = {}): string {
  if (config.dataRoot !== undefined && config.dataRoot.length > 0) return config.dataRoot
  const home = process.env.DSH_HOME
  return join(home === undefined || home.length === 0 ? process.cwd() : home, 'pm')
}

/** One project row in the workbench overview. */
export interface PmOverviewProject {
  readonly id: EntityId
  readonly title: string
  readonly status: ResearchProject['status']
  readonly evidence: number
  readonly hypotheses: number
}

/** Aggregated research pulse surfaced on the new-session home (`/pm/overview`). */
export interface PmOverview {
  readonly projects: readonly PmOverviewProject[]
  readonly totals: {
    readonly projects: number
    readonly evidence: number
    readonly hypotheses: number
    readonly supported: number
    readonly refuted: number
    readonly pendingKnowledge: number
  }
  /** Simulation engine availability surfaced on the home pulse. */
  readonly sim: { readonly analytic: boolean; readonly md: boolean }
}

/** One characterization analysis to archive and cite. */
export interface AnalysisRecordInput {
  readonly tool: string
  readonly result: Record<string, unknown>
  readonly dataPath: string
  readonly claimSupport: string
  readonly polarity?: Evidence['polarity']
  readonly strength?: Evidence['strength']
  readonly recordedBy: string
}

/** Four hex chars from a statement digest, used in hypothesis ids. */
export function statementHash4(statement: string): string {
  return createHash('sha256').update(statement.trim().toLowerCase()).digest('hex').slice(0, 4)
}

/** Facade owning one project-scoped set of stores. */
export class PmResearchEngine {
  private projects: ProjectStore | undefined
  private hypothesesStore: HypothesisStore | undefined
  private knowledgeStore: KnowledgeStore | undefined
  private readonly ledgers = new Map<EntityId, EvidenceLedger>()
  private readonly ledgerAppends = new Map<EntityId, Promise<unknown>>()

  private constructor(private readonly dataRoot: string) {}

  /**
   * Create the engine over `dataRoot` (created on demand).
   * @param dataRoot - absolute directory for all pm state.
   */
  static open(dataRoot: string): PmResearchEngine {
    return new PmResearchEngine(dataRoot)
  }

  /** Directory root (diagnostics and tests). */
  get root(): string {
    return this.dataRoot
  }

  private projectStore(): ProjectStore {
    if (this.projects === undefined) this.projects = ProjectStore.open(join(this.dataRoot, 'projects'))
    return this.projects
  }

  private hypothesisStore(): HypothesisStore {
    if (this.hypothesesStore === undefined) this.hypothesesStore = HypothesisStore.open(join(this.dataRoot, 'hypotheses'))
    return this.hypothesesStore
  }

  private ledger(projectId: EntityId): Promise<EvidenceLedger> {
    const existing = this.ledgers.get(projectId)
    if (existing !== undefined) return Promise.resolve(existing)
    const ledger = EvidenceLedger.open(join(this.dataRoot, 'projects', projectId, 'evidence.jsonl'))
    void ledger.then(instance => { this.ledgers.set(projectId, instance) }).catch(() => {})
    return ledger
  }

  /**
   * Create one research project.
   * @param input - project fields (title/question/domain).
   * @param actor - creating actor identity.
   */
  async createProject(input: {
    title: string
    question: string
    domain: ResearchProject['domain']
  }, actor: string): Promise<ResearchProject> {
    const store = this.projectStore()
    const existing = await store.list()
    const ordinal = existing.length + 1
    const hash4 = statementHash4(`${input.title}|${input.question}`)
    const project: ResearchProject = {
      id: `PR-${ordinal}-${hash4}`,
      title: input.title,
      question: input.question,
      domain: input.domain,
      status: 'active',
      createdAt: new Date().toISOString(),
      linkedWorkspaces: [],
    }
    await store.put(project)
    void actor
    return project
  }

  /** List projects. */
  async listProjects(): Promise<ResearchProject[]> {
    return this.projectStore().list()
  }

  /** Get one project. */
  async getProject(id: EntityId): Promise<ResearchProject | undefined> {
    return this.projectStore().get(id)
  }

  /**
   * Record one evidence entry (deduped by digest).
   * @param projectId - owning project.
   * @param input - evidence fields; `recordedBy` is the acting identity.
   */
  async recordEvidence(projectId: EntityId, input: Omit<RecordEvidenceInput, never>): Promise<{ evidence: Evidence; deduped: boolean }> {
    const project = await this.getProject(projectId)
    if (project === undefined) throw new PmNotFound(`project ${projectId} not found`)
    // Serialize appends per project so the ordinal inside the id stays unique.
    const previous = this.ledgerAppends.get(projectId) ?? Promise.resolve()
    const task = previous.then(async () => (await this.ledger(projectId)).append(input))
    this.ledgerAppends.set(projectId, task.catch(() => {}))
    return task
  }

  /** Query evidence of one project. */
  async queryEvidence(projectId: EntityId): Promise<readonly Evidence[]> {
    const ledger = await this.ledger(projectId)
    return ledger.all()
  }

  /** Verify one project's evidence chain. */
  async verifyEvidence(projectId: EntityId): Promise<{ verified: boolean; brokenAt?: EntityId; chainLength: number }> {
    const ledger = await this.ledger(projectId)
    return ledger.verify()
  }
  /**
   * Propose one hypothesis.
   * @param projectId - owning project.
   * @param input - hypothesis fields (statement/competitors/edges/evidence/test).
   * @param actor - proposing identity.
   */
  async proposeHypothesis(projectId: EntityId, input: {
    statement: string
    competitors: readonly string[]
    mechanismEdgeIds: readonly EntityId[]
    evidenceIds: readonly EntityId[]
    discriminatingTest?: DiscriminatingTest | undefined
  }, actor: string): Promise<Hypothesis> {
    const project = await this.getProject(projectId)
    if (project === undefined) throw new PmNotFound(`project ${projectId} not found`)
    const all = await this.hypothesisStore().list(projectId)
    return this.hypothesisStore().propose(projectId, {
      statement: input.statement,
      competitors: [...input.competitors],
      mechanismEdgeIds: [...input.mechanismEdgeIds],
      evidenceIds: [...input.evidenceIds],
      ...(input.discriminatingTest === undefined ? {} : { discriminatingTest: input.discriminatingTest }),
    }, all.length + 1, statementHash4(input.statement), actor)
  }

  /** List hypotheses of one project. */
  async listHypotheses(projectId: EntityId): Promise<readonly Hypothesis[]> {
    return this.hypothesisStore().list(projectId)
  }

  /**
   * Fold every project into the numbers the workbench home shows. Reads the
   * same stores the tools use, so the pulse cannot drift from the ledger.
   */
  async overview(): Promise<PmOverview> {
    const projects = await this.listProjects()
    const rows: PmOverviewProject[] = []
    let evidence = 0
    let hypotheses = 0
    let supported = 0
    let refuted = 0
    for (const project of projects) {
      const [entries, statements] = await Promise.all([
        this.queryEvidence(project.id),
        this.listHypotheses(project.id),
      ])
      evidence += entries.length
      hypotheses += statements.length
      supported += statements.filter(item => item.status === 'supported').length
      refuted += statements.filter(item => item.status === 'refuted').length
      rows.push({
        id: project.id,
        title: project.title,
        status: project.status,
        evidence: entries.length,
        hypotheses: statements.length,
      })
    }
    const cards = await this.knowledge().all()
    return {
      projects: rows,
      totals: {
        projects: rows.length,
        evidence,
        hypotheses,
        supported,
        refuted,
        pendingKnowledge: cards.filter(card => card.status === 'pending').length,
      },
      sim: { analytic: scienceAnalyticAvailable(), md: false },
    }
  }

  /**
   * Attempt one machine-gated hypothesis transition.
   * @param projectId - owning project.
   * @param hypothesisId - target hypothesis.
   * @param to - requested status.
   * @param rationale - required reason.
   * @param actor - requesting identity.
   * @param additionalEvidenceIds - evidence recorded after proposal (e.g. the
   *   discriminating run); resolved from the ledger and merged with the
   *   hypothesis's own citations.
   */
  async transitionHypothesis(
    projectId: EntityId,
    hypothesisId: EntityId,
    to: Hypothesis['status'],
    rationale: string,
    actor: string,
    additionalEvidenceIds?: readonly EntityId[],
  ): Promise<{ legal: boolean; reason?: string; hypothesis?: Hypothesis }> {
    // Resolve the cited evidence from the ledger so callers cannot invent gate fields.
    const items = await this.hypothesisStore().list(projectId)
    const current = items.find(item => item.id === hypothesisId)
    if (current === undefined) return { legal: false, reason: `hypothesis ${hypothesisId} not found` }
    const ledger = await this.ledger(projectId)
    const resolved: { id: EntityId; polarity: Evidence['polarity']; strength: Evidence['strength'] }[] = []
    const seen = new Set<EntityId>()
    for (const id of [...current.evidenceIds, ...(additionalEvidenceIds ?? [])]) {
      if (seen.has(id)) continue
      seen.add(id)
      const record = (await ledger).get(id)
      if (record !== undefined) resolved.push({ id: record.id, polarity: record.polarity, strength: record.strength })
    }
    return this.hypothesisStore().transition(projectId, hypothesisId, to, rationale, resolved, actor)
  }

  /** Project-scoped mechanism graph accessor. */
  mechanismGraph(projectId: EntityId): MechanismGraph {
    return MechanismGraph.open(join(this.dataRoot, 'projects', projectId, 'mechanism.json'))
  }

  /** Knowledge-card store accessor. */
  knowledge(): KnowledgeStore {
    if (this.knowledgeStore === undefined) this.knowledgeStore = KnowledgeStore.open(join(this.dataRoot, 'knowledge'))
    return this.knowledgeStore
  }

  /**
   * Import the seed mechanism catalog into one project's graph.
   * @param projectId - owning project.
   * @param seedPath - absolute path to seed.json.
   */
  async importSeed(projectId: EntityId, seedPath: string): Promise<{ nodes: number; edges: number; skipped: string[] }> {
    const raw = JSON.parse(await readFile(seedPath, 'utf8')) as SeedFile
    const graph = this.mechanismGraph(projectId)
    const idByKey = new Map<string, EntityId>()
    let nodeCount = 0
    for (const node of raw.nodes) {
      const created = await graph.upsertNode({
        projectId,
        type: node.type,
        name: node.name,
        ...(node.symbol === undefined || node.symbol === null ? {} : { symbol: node.symbol }),
        ...(node.unit === undefined ? {} : { unit: node.unit }),
        aliases: node.aliases ?? [],
      })
      idByKey.set(node.key, created.id)
      nodeCount += 1
    }
    let edgeCount = 0
    const skipped: string[] = []
    for (const edge of raw.edges) {
      const from = idByKey.get(edge.from)
      const to = idByKey.get(edge.to)
      if (from === undefined || to === undefined) {
        skipped.push(`${edge.from}->${edge.to}`)
        continue
      }
      const relation = edge.relation === 'rotates' ? 'mediates' : edge.relation
      if (!isEdgeRelation(relation)) {
        skipped.push(`${edge.from}->${edge.to} (relation ${edge.relation})`)
        continue
      }
      const source = edge.source ?? ''
      const doiPrefix = 'doi:'
      const isDoi = source.startsWith(doiPrefix)
      await graph.addEdge({
        projectId,
        from,
        to,
        relation,
        ...(edge.equation === undefined ? {} : { equation: edge.equation }),
        conditions: edge.conditions ?? {},
        theorySource: isDoi
          ? { type: 'doi', ref: source.slice(doiPrefix.length).trim() }
          : { type: 'file', ref: source.length > 0 ? source : 'seed.json' },
        applicability: edge.applicability,
        createdBy: 'seed',
        strongSupportingEvidence: edge.applicability === 'established' ? 1 : 0,
      })
      edgeCount += 1
    }
    return { nodes: nodeCount, edges: edgeCount, skipped }
  }

  /**
   * Gate evaluation with ledger-resolved evidence.
   * @param projectId - owning project (ledger source).
   * @param input - gate inputs without evidence; evidence arrives by id.
   */
  async gateEvaluate(projectId: EntityId, input: Omit<GateInput, 'evidence'> & { readonly evidenceIds?: readonly EntityId[] }): Promise<GateVerdict> {
    const resolved: Evidence[] = []
    if (input.evidenceIds !== undefined) {
      const projectLedger = await this.ledger(projectId)
      for (const id of input.evidenceIds) {
        const record = projectLedger.get(id)
        if (record !== undefined) resolved.push(record)
      }
    }
    return evaluateGate({ ...input, ...(resolved.length === 0 ? {} : { evidence: resolved }) })
  }

  /**
   * Persist one JSON artifact under the project's artifacts directory.
   * @param projectId - owning project.
   * @param name - human label; sanitized before it becomes a file name.
   * @param value - JSON-safe payload.
   * @returns absolute artifact path.
   */
  async archiveArtifact(projectId: EntityId, name: string, value: unknown): Promise<string> {
    const project = await this.getProject(projectId)
    if (project === undefined) throw new PmNotFound(`project ${projectId} not found`)
    const directory = join(this.dataRoot, 'projects', projectId, 'artifacts')
    await mkdir(directory, { recursive: true })
    const safe = name.replace(/[^a-zA-Z0-9._-]/gu, '-')
    const artifactPath = join(directory, `${safe}.json`)
    await writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    return artifactPath
  }

  /**
   * Archive an analysis result and cite it as one evidence entry. The evidence
   * carries the artifact path and the original data path so a downstream
   * reader can replay the derivation.
   * @param projectId - owning project.
   * @param input - tool/result/data path plus the claim the result supports.
   */
  async recordAnalysis(
    projectId: EntityId,
    input: AnalysisRecordInput,
  ): Promise<{ evidence: Evidence; artifactPath: string; deduped: boolean }> {
    const artifactPath = await this.archiveArtifact(
      projectId,
      `${input.tool}-${new Date().toISOString().replace(/[:.]/gu, '-')}`,
      { tool: input.tool, dataPath: input.dataPath, result: input.result, recordedAt: new Date().toISOString() },
    )
    const { evidence, deduped } = await this.recordEvidence(projectId, {
      claimSupport: input.claimSupport,
      polarity: input.polarity ?? 'neutral',
      strength: input.strength ?? 'moderate',
      sourceRef: { type: 'file', ref: input.dataPath },
      payload: { analysis: input.tool, artifactPath, result: input.result },
      recordedBy: input.recordedBy,
    })
    return { evidence, artifactPath, deduped }
  }

  /**
   * Archive one simulation result and cite it as engine-backed evidence. The
   * evidence payload marks the result as simulation output so gates and
   * reviewers can keep model predictions apart from measured facts.
   * @param projectId - owning project.
   * @param input - tool/result plus the claim the simulation supports.
   */
  async recordSimulation(
    projectId: EntityId,
    input: AnalysisRecordInput,
  ): Promise<{ evidence: Evidence; artifactPath: string; deduped: boolean }> {
    const artifactPath = await this.archiveArtifact(
      projectId,
      `${input.tool}-${new Date().toISOString().replace(/[:.]/gu, '-')}`,
      { tool: input.tool, simulation: true, result: input.result, recordedAt: new Date().toISOString() },
    )
    const { evidence, deduped } = await this.recordEvidence(projectId, {
      claimSupport: input.claimSupport,
      polarity: input.polarity ?? 'neutral',
      strength: input.strength ?? 'moderate',
      sourceRef: { type: 'run', ref: artifactPath },
      payload: { simulation: input.tool, artifactPath, result: input.result },
      recordedBy: input.recordedBy,
    })
    return { evidence, artifactPath, deduped }
  }
}

interface SeedFile {
  readonly nodes: readonly {
    readonly key: string
    readonly type: MechanismNode['type']
    readonly name: string
    readonly symbol?: string | null
    readonly unit?: string
    readonly aliases?: readonly string[]
  }[]
  readonly edges: readonly {
    readonly from: string
    readonly to: string
    readonly relation: string
    readonly equation?: string
    readonly conditions?: Record<string, unknown>
    readonly applicability: 'candidate' | 'established'
    readonly source?: string
  }[]
}

const EDGE_RELATIONS: readonly string[] = ['increases', 'decreases', 'determines', 'couples', 'competes', 'mediates']

function isEdgeRelation(value: string): value is MechanismEdge['relation'] {
  return EDGE_RELATIONS.includes(value)
}

/** Not-found error surfaced to tools as INVALID_ARGUMENT-shaped failures. */
export class PmNotFound extends Error {}

/**
 * Whether the analytic polymer-physics engine (science venv + CLI) is runnable.
 * @returns true when the repository-fixed science runtime resolves.
 */
function scienceAnalyticAvailable(): boolean {
  try {
    resolveScienceRuntime()
    return true
  } catch {
    return false
  }
}
