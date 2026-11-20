/** Evidence ledger: append-only JSONL persistence with content hashing and dedup. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  EntityId,
  Evidence,
  EvidencePolarity,
  EvidenceSourceRef,
  EvidenceStrength,
} from '@polymechanism/pm-domain'

/** Fields hashed into the tamper-evident evidence digest. */
export interface EvidenceDigestInput {
  readonly claimSupport: string
  readonly polarity: EvidencePolarity
  readonly strength: EvidenceStrength
  readonly sourceRef: EvidenceSourceRef
  /** Structured payload; key order normalized before hashing. */
  readonly payload?: Readonly<Record<string, unknown>>
}

/** Canonical stable JSON: sorted object keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

/** SHA-256 over the canonical digest input; the ledger's tamper evidence. */
export function evidenceHash(input: EvidenceDigestInput): string {
  return createHash('sha256').update(canonicalJson({
    claimSupport: input.claimSupport,
    polarity: input.polarity,
    strength: input.strength,
    sourceRef: input.sourceRef,
    payload: input.payload ?? {},
  })).digest('hex')
}

/** Next entity id for one ledger: deterministic prefix + ordinal + hash4. */
export function nextEvidenceId(existing: readonly Evidence[], hash: string): EntityId {
  return `EV-${existing.length + 1}-${hash.slice(0, 4)}`
}

/** Inputs that mint one evidence record. */
export type RecordEvidenceInput = EvidenceDigestInput & {
  readonly observationId?: EntityId
  readonly recordedBy: string
  /** ISO-8601 instant; defaults to now. */
  readonly recordedAt?: string
}

/**
 * Append-only evidence ledger backed by one JSONL file. Records are immutable;
 * duplicates (same digest) collapse to the original id.
 */
export class EvidenceLedger {
  private readonly records: Evidence[] = []
  private readonly byHash = new Map<string, Evidence>()

  private constructor(private readonly filePath: string) {}

  /**
   * Load (or start) the ledger at `filePath`, rebuilding the in-memory index.
   * @param filePath - absolute JSONL path; missing file starts an empty ledger.
   */
  static async open(filePath: string): Promise<EvidenceLedger> {
    const ledger = new EvidenceLedger(filePath)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch {
      return ledger
    }
    for (const [index, line] of raw.split('\n').entries()) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      let parsed: Evidence
      try {
        parsed = JSON.parse(trimmed) as Evidence
      } catch (cause) {
        throw new Error(`evidence ledger line ${index + 1} is not valid JSON: ${String(cause)}`)
      }
      ledger.records.push(parsed)
      ledger.byHash.set(parsed.hash, parsed)
    }
    return ledger
  }

  /** All records in append order. */
  all(): readonly Evidence[] {
    return this.records
  }

  /** Look up one record by id. */
  get(id: EntityId): Evidence | undefined {
    return this.records.find(record => record.id === id)
  }

  /**
   * Verify the whole chain: every stored hash must equal the digest recomputed
   * from its own content, and every record after the first must point at its
   * predecessor's hash. A deleted or reordered line therefore breaks the chain.
   */
  verify(): { verified: boolean; brokenAt?: EntityId; chainLength: number } {
    let previous: string | undefined
    for (const [index, record] of this.records.entries()) {
      const stored = record as Evidence
      const expected = evidenceHash({
        claimSupport: record.claimSupport,
        polarity: record.polarity,
        strength: record.strength,
        sourceRef: record.sourceRef,
        ...(stored.payload === undefined ? {} : { payload: stored.payload }),
      })
      if (expected !== record.hash) {
        return { verified: false, brokenAt: record.id, chainLength: this.records.length }
      }
      if (index > 0 && record.prevHash !== previous) {
        return { verified: false, brokenAt: record.id, chainLength: this.records.length }
      }
      previous = record.hash
    }
    return { verified: true, chainLength: this.records.length }
  }

  /**
   * Append one evidence record. Same digest → returns the existing record and
   * never writes twice. `payload` is folded into the record for verification.
   * @param input - evidence fields to mint.
   */
  async append(input: RecordEvidenceInput): Promise<{ evidence: Evidence; deduped: boolean }> {
    const hash = evidenceHash(input)
    const existing = this.byHash.get(hash)
    if (existing !== undefined) return { evidence: existing, deduped: true }
    const id = nextEvidenceId(this.records, hash)
    const previous = this.records.at(-1)
    const record: Evidence = {
      id,
      ...(input.observationId === undefined ? {} : { observationId: input.observationId }),
      claimSupport: input.claimSupport,
      polarity: input.polarity,
      strength: input.strength,
      sourceRef: input.sourceRef,
      hash,
      ...(previous === undefined ? {} : { prevHash: previous.hash }),
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      ...(input.payload === undefined ? {} : { payload: { ...input.payload } }),
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8')
    this.records.push(record)
    this.byHash.set(hash, record)
    return { evidence: record, deduped: false }
  }
}
