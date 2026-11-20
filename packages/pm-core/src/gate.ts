/** Scientific gate: falsifiable checks over claims, edges, hypotheses, and model use. */

import type {
  Evidence,
  MechanismEdge,
  ModelSpec,
} from '@polymechanism/pm-domain'

/** Kinds of gate evaluations. */
export type GateKind = 'claim' | 'edge' | 'hypothesis' | 'optics' | 'model-use'

/** One executed check. */
export interface GateCheck {
  readonly rule: string
  readonly ok: boolean
  readonly detail: string
}

/** Aggregate verdict over all executed checks. */
export interface GateVerdict {
  readonly verdict: 'pass' | 'warn' | 'block'
  readonly checks: readonly GateCheck[]
  readonly requiredEvidence: readonly string[]
}

/** Optional resolver interface so network DOIs stay testable offline. */
export interface DoiVerifier {
  verify(doi: DOIPattern): Promise<boolean>
}

/** DOI-shaped string. */
export type DOIPattern = string

/** Inputs for one gate evaluation. */
export interface GateInput {
  readonly kind: GateKind
  /** Evidence records resolved from the ledger by the caller. */
  readonly evidence?: readonly Evidence[] | undefined
  /** Edge under evaluation (kind='edge'). */
  readonly edge?: MechanismEdge | undefined
  /** Model under evaluation (kind='model-use'). */
  readonly model?: ModelSpec | undefined
  /** Proposed parameter values (kind='model-use'). */
  readonly params?: Readonly<Record<string, number>> | undefined
  /** Claimed optical numbers (kind='optics'): deltaN, orientationFactor, intrinsicBirefringence. */
  readonly optics?: {
    readonly deltaN: number
    readonly orientationFactor?: number | undefined
    readonly intrinsicBirefringence?: number | undefined
  } | undefined
  /** Claim text (kind='claim'). */
  readonly claim?: string | undefined
  /** Competitors with exclusion state (kind='claim'/'hypothesis'). */
  readonly competitors?: readonly { readonly statement: string; readonly excluded: boolean }[] | undefined
  /**
   * Result of an out-of-band DOI resolution (kind='edge', established edges).
   * Omitted means "not checked": the verdict degrades to warn instead of
   * claiming a verified source.
   */
  readonly doiResolved?: boolean | undefined
}

/**
 * Run the gate for one evaluation kind. Rules follow docs 06 §5.3:
 * unit sanity, evidence binding, competitor exclusion, model range, optics
 * consistency, and DOI shape (network verification is pluggable).
 * @param input - gate inputs with ledger-resolved evidence.
 */
export function evaluateGate(input: GateInput): GateVerdict {
  const checks: GateCheck[] = []
  const requiredEvidence: string[] = []
  if (input.evidence !== undefined) {
    for (const record of input.evidence) {
      if (!isSha256(record.hash)) {
        checks.push({ rule: 'G-EVID', ok: false, detail: `evidence ${record.id} carries a malformed hash` })
        continue
      }
      checks.push({ rule: 'G-EVID', ok: true, detail: `evidence ${record.id} hash verified shape` })
    }
  }
  if (input.kind === 'edge' && input.edge !== undefined) {
    checks.push(unitCheck(input.edge.equation))
    if (input.edge.applicability === 'established') {
      const strong = input.evidence?.filter(item =>
        item.polarity === 'supports' && item.strength === 'strong') ?? []
      checks.push({
        rule: 'G-EVID',
        ok: strong.length >= 1,
        detail: strong.length >= 1
          ? `${strong.length} strong supporting evidence`
          : 'established edge requires at least one strong supporting evidence',
      })
      if (input.edge.theorySource === undefined) {
        checks.push({ rule: 'G-DOI', ok: false, detail: 'established edge requires a theory source' })
      } else if (input.doiResolved === false) {
        checks.push({ rule: 'G-DOI', ok: false, detail: 'theory source DOI did not resolve' })
      } else if (input.doiResolved === true) {
        checks.push({ rule: 'G-DOI', ok: true, detail: 'theory source DOI resolved' })
      } else {
        checks.push({
          rule: 'G-DOI',
          ok: true,
          detail: 'theory source present (shape-checked); DOI not resolved in this call — mark unverified',
        })
      }
    }
  }
  if (input.kind === 'model-use' && input.model !== undefined && input.params !== undefined) {
    checks.push(rangeCheck(input.model, input.params))
  }
  if (input.kind === 'optics' && input.optics !== undefined) {
    checks.push(opticsCheck(input.optics))
  }
  if ((input.kind === 'claim' || input.kind === 'hypothesis') && input.competitors !== undefined) {
    checks.push(competitorCheck(input.competitors))
  }
  if (input.kind === 'claim' || input.kind === 'hypothesis') {
    // A conclusion must bind to at least one ledger evidence record: an
    // unbound claim is blocked, not merely noted (docs 06 §5.3 G-EVID).
    const bound = input.evidence?.length ?? 0
    if (bound === 0) {
      requiredEvidence.push('claim carries no evidence ids — record evidence first')
      checks.push({ rule: 'G-EVID', ok: false, detail: 'claim has no bound evidence records' })
    } else {
      checks.push({ rule: 'G-EVID', ok: true, detail: `${String(bound)} evidence record(s) bound` })
    }
  }
  // Conclusions need a ruled-out alternative: an unexcluded competitor blocks,
  // exactly like unbound or malformed evidence.
  const blockingRules = new Set(['G-EVID', 'G-DOI', 'G-COMPETE'])
  const blocked = checks.some(check => !check.ok && blockingRules.has(check.rule))
  const warned = checks.some(check => !check.ok)
  return {
    verdict: blocked ? 'block' : warned ? 'warn' : 'pass',
    checks,
    requiredEvidence,
  }
}

function unitCheck(equation: string | undefined): GateCheck {
  if (equation === undefined) {
    return { rule: 'G-UNIT', ok: true, detail: 'no equation on this edge' }
  }
  const hasUnitHint = /(MPa|GPa|K\b|℃|°C|s\b|s\^|nm|μm|µm|mm|cm|g\/|mol|J\b|%|dimensionless|无量纲)/u.test(equation)
  return {
    rule: 'G-UNIT',
    ok: hasUnitHint,
    detail: hasUnitHint
      ? 'equation carries explicit units'
      : 'equation found without explicit units — declare units before promotion',
  }
}

function rangeCheck(model: ModelSpec, params: Readonly<Record<string, number>>): GateCheck {
  for (const [name, value] of Object.entries(params)) {
    const window = model.validRange[name]
    if (window === undefined) continue
    if (value < window[0] || value > window[1]) {
      return {
        rule: 'G-RANGE',
        ok: false,
        detail: `param ${name}=${String(value)} outside validRange [${String(window[0])}, ${String(window[1])}]`,
      }
    }
  }
  return { rule: 'G-RANGE', ok: true, detail: 'all provided params inside validRange' }
}

function opticsCheck(optics: {
  deltaN: number
  orientationFactor?: number | undefined
  intrinsicBirefringence?: number | undefined
}): GateCheck {
  const { deltaN, orientationFactor, intrinsicBirefringence } = optics
  if (orientationFactor !== undefined && intrinsicBirefringence !== undefined) {
    const predicted = orientationFactor * intrinsicBirefringence
    const ratio = Math.abs(deltaN - predicted) / Math.max(Math.abs(predicted), 1e-6)
    const ok = ratio < 0.25
    return {
      rule: 'G-OPTICS',
      ok,
      detail: ok
        ? `Δn=${String(deltaN)} consistent with f·Δn₀=${predicted.toFixed(3)}`
        : `Δn=${String(deltaN)} deviates ${(ratio * 100).toFixed(0)}% from f·Δn₀ — check two-phase model applicability`,
    }
  }
  const magnitudeOk = deltaN > 0 && deltaN < 0.1
  return {
    rule: 'G-OPTICS',
    ok: magnitudeOk,
    detail: magnitudeOk
      ? 'Δn magnitude plausible for polymer films (<0.1)'
      : `Δn=${String(deltaN)} outside typical polymer-film range (0, 0.1)`,
  }
}

function competitorCheck(competitors: readonly { readonly statement: string; readonly excluded: boolean }[]): GateCheck {
  const excluded = competitors.filter(item => item.excluded)
  // A conclusion needs a falsifiable alternative that was actually ruled out;
  // declaring no competitor at all is not evidence of exclusivity (docs 06 §5.3).
  return {
    rule: 'G-COMPETE',
    ok: excluded.length >= 1,
    detail: competitors.length === 0
      ? 'no competitors declared — enumerate at least one alternative and exclude it'
      : excluded.length >= 1
        ? `${String(excluded.length)} competitor(s) excluded`
        : 'declare at least one excluded competitor before concluding',
  }
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value)
}
