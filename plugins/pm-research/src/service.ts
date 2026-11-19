/** Research engine facade: per-project stores rooted at one data root. */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  EvidenceLedger,
  HypothesisStore,
  ProjectStore,
} from '@polymechanism/pm-core'
import type { RecordEvidenceInput } from '@polymechanism/pm-core'
import type {
  DiscriminatingTest,
  EntityId,
  Evidence,
  Hypothesis,
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

/** Four hex chars from a statement digest, used in hypothesis ids. */
export function statementHash4(statement: string): string {
  return createHash('sha256').update(statement.trim().toLowerCase()).digest('hex').slice(0, 4)
}

/** Facade owning one project-scoped set of stores. */
export class PmResearchEngine {
  private projects: ProjectStore | undefined
  private hypothesesStore: HypothesisStore | undefined
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
   * Attempt one machine-gated hypothesis transition.
   * @param projectId - owning project.
   * @param hypothesisId - target hypothesis.
   * @param to - requested status.
   * @param rationale - required reason.
   * @param actor - requesting identity.
   */
  async transitionHypothesis(
    projectId: EntityId,
    hypothesisId: EntityId,
    to: Hypothesis['status'],
    rationale: string,
    actor: string,
  ): Promise<{ legal: boolean; reason?: string; hypothesis?: Hypothesis }> {
    // Resolve the cited evidence from the ledger so callers cannot invent gate fields.
    const items = await this.hypothesisStore().list(projectId)
    const current = items.find(item => item.id === hypothesisId)
    if (current === undefined) return { legal: false, reason: `hypothesis ${hypothesisId} not found` }
    const ledger = await this.ledger(projectId)
    const resolved: { id: EntityId; polarity: Evidence['polarity']; strength: Evidence['strength'] }[] = []
    for (const id of current.evidenceIds) {
      const record = (await ledger).get(id)
      if (record !== undefined) resolved.push({ id: record.id, polarity: record.polarity, strength: record.strength })
    }
    return this.hypothesisStore().transition(projectId, hypothesisId, to, rationale, resolved, actor)
  }
}

/** Not-found error surfaced to tools as INVALID_ARGUMENT-shaped failures. */
export class PmNotFound extends Error {}
