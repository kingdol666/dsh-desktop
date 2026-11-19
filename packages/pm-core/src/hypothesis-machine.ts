/** Hypothesis state machine: legal transitions plus the conclusion evidence gate. */

import {
  HYPOTHESIS_TRANSITIONS,
  hypothesisReadyForConclusion,
  isHypothesisTransitionLegal,
  satisfiesConclusionGate,
  type DiscriminatingTest,
  type EntityId,
  type EvidencePolarity,
  type EvidenceStrength,
  type HypothesisStatus,
  type HypothesisTransition,
} from '@polymechanism/pm-domain'

/** Gate-relevant view of one cited evidence item. */
export interface GateEvidenceItem {
  readonly id: EntityId
  readonly polarity: EvidencePolarity
  readonly strength: EvidenceStrength
}

/** Inputs for one transition attempt. */
export interface HypothesisMoveInput {
  readonly from: HypothesisStatus
  readonly to: HypothesisStatus
  readonly rationale: string
  /** Evidence cited for this move: id + gate-relevant fields. */
  readonly evidence: readonly GateEvidenceItem[]
  readonly actor: string
  /** ISO-8601 instant. */
  readonly at: string
  readonly discriminatingTest?: DiscriminatingTest
}

export type HypothesisMoveVerdict =
  | { readonly legal: true; readonly transition: HypothesisTransition }
  | { readonly legal: false; readonly reason: string }

/**
 * Attempt one hypothesis transition. Structural legality, the conclusion gate
 * (supported/refuted need ≥2 evidence with ≥1 strong), and the discriminating
 * test requirement are enforced here — never in prompts.
 * @param input - the attempted move with its cited evidence.
 */
export function attemptHypothesisMove(input: HypothesisMoveInput): HypothesisMoveVerdict {
  if (!isHypothesisTransitionLegal(input.from, input.to)) {
    return {
      legal: false,
      reason: `transition ${input.from} → ${input.to} is not legal; allowed: ${HYPOTHESIS_TRANSITIONS[input.from].join(', ')}`,
    }
  }
  const rationale = input.rationale.trim()
  if (rationale.length === 0) return { legal: false, reason: 'a transition requires a rationale' }
  const isConclusion = input.to === 'supported' || input.to === 'refuted'
  if (isConclusion) {
    if (input.discriminatingTest === undefined) {
      return { legal: false, reason: `${input.to} requires a discriminating test` }
    }
    if (!satisfiesConclusionGate(input.evidence)) {
      return {
        legal: false,
        reason: `${input.to} requires at least 2 evidence items including at least 1 strong`,
      }
    }
    if (input.to === 'supported' && !input.evidence.some(item => item.polarity === 'supports')) {
      return { legal: false, reason: 'supported requires at least one supports-polarity evidence' }
    }
    if (input.to === 'refuted' && !input.evidence.some(item => item.polarity === 'refutes')) {
      return { legal: false, reason: 'refuted requires at least one refutes-polarity evidence' }
    }
  }
  return {
    legal: true,
    transition: {
      from: input.from,
      to: input.to,
      rationale,
      evidenceIds: input.evidence.map(item => item.id),
      at: input.at,
      actor: input.actor,
    },
  }
}

/** Whether the current evidence set would satisfy the conclusion gate at all. */
export function conclusionGateSummary(evidence: readonly GateEvidenceItem[]): { readonly count: number; readonly strong: number; readonly satisfied: boolean } {
  return {
    count: evidence.length,
    strong: evidence.filter(item => item.strength === 'strong').length,
    satisfied: satisfiesConclusionGate(evidence),
  }
}

// Re-exported for consumers that only see pm-core.
export { hypothesisReadyForConclusion }
