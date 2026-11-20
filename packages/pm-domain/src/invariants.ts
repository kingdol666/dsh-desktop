/** PolyMechanism domain invariants — pure guards with no runtime dependencies. */

import type {
  EvidencePolarity,
  EvidenceStrength,
  EvidenceSourceRef,
  Hypothesis,
  HypothesisStatus,
} from './entities.ts'

const EVIDENCE_POLARITIES: readonly EvidencePolarity[] = ['supports', 'refutes', 'neutral']
const EVIDENCE_STRENGTHS: readonly EvidenceStrength[] = ['strong', 'moderate', 'weak']
const SOURCE_TYPES: readonly EvidenceSourceRef['type'][] = ['doi', 'dataset', 'file', 'run']

/** Whether the evidence field set is internally consistent (hash handled by pm-core). */
export function isEvidenceShape(input: {
  polarity: string
  strength: string
  sourceType: string
  claimSupport: string
}): boolean {
  return EVIDENCE_POLARITIES.includes(input.polarity as EvidencePolarity)
    && EVIDENCE_STRENGTHS.includes(input.strength as EvidenceStrength)
    && SOURCE_TYPES.includes(input.sourceType as EvidenceSourceRef['type'])
    && input.claimSupport.trim().length > 0
}

const HYPOTHESIS_TRANSITION_TABLE: Record<HypothesisStatus, readonly HypothesisStatus[]> = {
  proposed: ['conditional', 'archived'],
  conditional: ['under_test', 'archived'],
  under_test: ['supported', 'refuted', 'archived'],
  supported: ['archived'],
  refuted: ['archived'],
  archived: [],
}

/**
 * Legal hypothesis status transitions. Every transition is allowed only from
 * this map; anything absent is rejected by the machine in pm-core.
 */
export const HYPOTHESIS_TRANSITIONS: Readonly<Record<HypothesisStatus, readonly HypothesisStatus[]>> = Object.freeze(HYPOTHESIS_TRANSITION_TABLE)

/** Whether moving `from` to `to` is structurally legal (evidence gate handled in pm-core). */
export function isHypothesisTransitionLegal(from: HypothesisStatus, to: HypothesisStatus): boolean {
  return HYPOTHESIS_TRANSITIONS[from].includes(to)
}

/** Minimum evidence before a hypothesis may leave `under_test` as supported/refuted. */
export const CONCLUSION_EVIDENCE_MINIMUM = 2 as const
/** Strong evidence required among the conclusion evidence set. */
export const CONCLUSION_STRONG_MINIMUM = 1 as const

/** Gate-relevant view of one evidence item (polarity + strength). */
export interface ConclusionEvidenceItem {
  readonly polarity: EvidencePolarity
  readonly strength: EvidenceStrength
}

/**
 * Whether the evidence set satisfies the conclusion gate: at least the minimum
 * count with at least one strong item. Polarities are the caller's concern.
 * @param evidence - polarities and strengths of the cited evidence set.
 */
export function satisfiesConclusionGate(evidence: readonly ConclusionEvidenceItem[]): boolean {
  if (evidence.length < CONCLUSION_EVIDENCE_MINIMUM) return false
  return evidence.filter(item => item.strength === 'strong').length >= CONCLUSION_STRONG_MINIMUM
}

/**
 * Whether a hypothesis structurally carries everything the conclusion gate
 * needs before pm-core checks its evidence set: a discriminating test.
 * @param hypothesis - current hypothesis state.
 */
export function hypothesisReadyForConclusion(hypothesis: Hypothesis): boolean {
  return hypothesis.discriminatingTest !== undefined
}

/**
 * Whether a mechanism edge may be promoted to `established`.
 *
 * Agent/human proposals need a theory source AND at least one strong supporting
 * evidence bound from the ledger. Seed edges are the imported literature
 * baseline: their `createdBy: 'seed'` origin plus a theory source is the
 * reference itself, so they do not have to fabricate project evidence.
 * @param hasTheorySource - whether edge.theorySource is present.
 * @param strongSupportingEvidence - count of strong `supports` evidence bound to the edge.
 * @param origin - who created the edge; seeds carry their source in theorySource.
 */
export function edgePromotableToEstablished(
  hasTheorySource: boolean,
  strongSupportingEvidence: number,
  origin: 'seed' | 'agent' | 'human' = 'agent',
): boolean {
  if (!hasTheorySource) return false
  if (origin === 'seed') return true
  return strongSupportingEvidence >= 1
}
