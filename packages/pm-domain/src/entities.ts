/** PolyMechanism domain entities. Types only — hashing/persistence live in pm-core. */

import type { EntityId } from './index.ts'

/** A research project: one mechanistic question with its evidence corpus. */
export interface ResearchProject {
  readonly id: EntityId
  readonly title: string
  /** The mechanistic question this project answers. */
  readonly question: string
  readonly domain: 'pva-optical-film' | 'generic-polymer'
  readonly status: 'active' | 'paused' | 'archived'
  /** ISO-8601 instant. */
  readonly createdAt: string
  /** DSH workspace ids linked to this project. */
  readonly linkedWorkspaces: readonly string[]
}

/** A raw measured fact before it becomes citable evidence. */
export interface Observation {
  readonly id: EntityId
  readonly projectId: EntityId
  readonly kind: 'experiment' | 'cae' | 'characterization' | 'literature' | 'simulation'
  /** Structured numeric payload (units explicit per docs 05 §3.1). */
  readonly payload: Readonly<Record<string, unknown>>
  /** Optional on-disk artifact with content hash. */
  readonly artifact?: { readonly path: string; readonly sha256: string; readonly mime: string }
  /** ISO-8601 instant. */
  readonly capturedAt: string
  readonly operator: 'human' | 'agent' | 'import'
}

/** A citable, hash-anchored claim about one observation or source. */
export interface Evidence {
  readonly id: EntityId
  readonly observationId?: EntityId
  /** What this evidence supports or refutes, in one sentence. */
  readonly claimSupport: string
  readonly polarity: EvidencePolarity
  readonly strength: EvidenceStrength
  readonly sourceRef: EvidenceSourceRef
  /** Structured numeric payload folded into the digest (units explicit). */
  readonly payload?: Readonly<Record<string, unknown>>
  /** SHA-256 over the canonical form of claimSupport/polarity/strength/sourceRef/payload. */
  readonly hash: string
  /**
   * Hash of the previous record in the append-only chain. Absent only on the
   * first record (genesis) and on ledgers written before the chain existed.
   */
  readonly prevHash?: string
  /** Identity of the recording actor (preset id or 'human:<name>'). */
  readonly recordedBy: string
  /** ISO-8601 instant. */
  readonly recordedAt: string
}

export type EvidencePolarity = 'supports' | 'refutes' | 'neutral'
export type EvidenceStrength = 'strong' | 'moderate' | 'weak'

export interface EvidenceSourceRef {
  readonly type: 'doi' | 'dataset' | 'file' | 'run'
  /** DOI, dataset path, file path, or CAE run id. */
  readonly ref: string
}

/** Structural fields every hypothesis carries when proposed. */
export interface HypothesisInput {
  readonly projectId: EntityId
  readonly statement: string
  /** Competing hypothesis ids or statements. */
  readonly competitors: readonly string[]
  readonly mechanismEdgeIds: readonly EntityId[]
  readonly evidenceIds: readonly EntityId[]
  /** The observation that would discriminate this hypothesis from its competitors. */
  readonly discriminatingTest?: DiscriminatingTest | undefined
}

export interface DiscriminatingTest {
  readonly design: string
  readonly observable: string
  readonly expectedIfTrue: string
  readonly expectedIfFalse: string
}

export type HypothesisStatus =
  | 'proposed'
  | 'conditional'
  | 'under_test'
  | 'supported'
  | 'refuted'
  | 'archived'

export interface Hypothesis extends HypothesisInput {
  readonly id: EntityId
  readonly status: HypothesisStatus
  /** Append-only transition log with rationale. */
  readonly transitions: readonly HypothesisTransition[]
}

export interface HypothesisTransition {
  readonly from: HypothesisStatus | null
  readonly to: HypothesisStatus
  readonly rationale: string
  readonly evidenceIds: readonly EntityId[]
  readonly at: string
  readonly actor: string
}

/** One physical quantity or process in the mechanism graph. */
export interface MechanismNode {
  readonly id: EntityId
  readonly projectId: EntityId
  readonly type: 'process' | 'structure' | 'property' | 'condition' | 'material'
  readonly name: string
  readonly symbol?: string
  readonly unit?: string
  readonly aliases: readonly string[]
}

/** One candidate physical relation with conditions and evidence binding. */
export interface MechanismEdge {
  readonly id: EntityId
  readonly projectId: EntityId
  readonly from: EntityId
  readonly to: EntityId
  readonly relation: 'increases' | 'decreases' | 'determines' | 'couples' | 'competes' | 'mediates'
  /** LaTeX equation when the relation is quantitative. */
  readonly equation?: string
  /** Applicability window; fields optional and conditions are conjunctive. */
  readonly conditions: Readonly<Record<string, unknown>>
  readonly applicability: 'established' | 'candidate' | 'disputed' | 'refuted'
  readonly theorySource?: EvidenceSourceRef & { readonly chapter?: string }
  /** 0..1 confidence assigned by review, never by the proposing agent alone. */
  readonly confidence: number
  readonly openQuestions: readonly string[]
  /** Ledger evidence bound to this edge (ids resolve to evidence.jsonl). */
  readonly evidenceIds: readonly EntityId[]
  readonly createdBy: 'seed' | 'agent' | 'human'
  readonly createdAt: string
}

/** An executable scientific asset: equations + parameter bounds + implementation pointer. */
export interface ModelSpec {
  readonly id: string
  readonly name: string
  readonly domain: 'rheology' | 'optics' | 'orientation' | 'crystallization' | 'thermo'
  readonly equations: readonly string[]
  readonly params: readonly {
    name: string
    unit?: string
    min?: number
    max?: number
  }[]
  /** Named validity windows the gate enforces before fitting. */
  readonly validRange: Readonly<Record<string, readonly [number, number]>>
  readonly implementation: { readonly engine: 'mcp'; readonly tool: string }
  readonly status: 'draft' | 'validated' | 'deprecated'
}

/** One reviewable knowledge unit in the RSI loop. */
export interface KnowledgeCard {
  readonly id: EntityId
  readonly scope: 'global' | 'project' | 'agent'
  readonly kind: 'fact' | 'method' | 'pitfall' | 'decision' | 'edge-candidate'
  readonly title: string
  readonly body: string
  readonly links: {
    readonly nodeIds?: readonly EntityId[]
    readonly edgeIds?: readonly EntityId[]
    readonly evidenceIds?: readonly EntityId[]
  }
  readonly status: 'pending' | 'approved' | 'rejected' | 'superseded'
  readonly origin: { readonly agent: string; readonly at: string; readonly sessionId?: string }
  readonly reviewedBy?: string
  readonly reviewedAt?: string
  readonly reviewRationale?: string
}
