import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EvidenceLedger, canonicalJson, evidenceHash } from '../src/index.ts'

function sampleInput(claim: string) {
  return {
    claimSupport: claim,
    polarity: 'supports',
    strength: 'strong',
    sourceRef: { type: 'doi' as const, ref: '10.1234/pva.2026' },
    payload: { deltaN: 0.023, temperatureC: 105 },
    recordedBy: 'polymer-modeler',
  }
}

describe('canonical evidence hashing', () => {
  it('normalizes key order so semantically equal payloads hash equal', () => {
    const a = evidenceHash(sampleInput('λ raises orientation'))
    const b = evidenceHash({
      claimSupport: 'λ raises orientation',
      polarity: 'supports',
      strength: 'strong',
      sourceRef: { ref: '10.1234/pva.2026', type: 'doi' },
      payload: { temperatureC: 105, deltaN: 0.023 },
      recordedBy: 'someone-else',
    })
    expect(a).toBe(b)
  })

  it('changes when any digest field changes', () => {
    const base = evidenceHash(sampleInput('claim'))
    const flipped = evidenceHash({ ...sampleInput('claim'), polarity: 'refutes' as const })
    expect(base).not.toBe(flipped)
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })
})

describe('evidence ledger', () => {
  it('appends, assigns ids, and deduplicates by digest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-ledger-'))
    const ledger = await EvidenceLedger.open(join(dir, 'evidence.jsonl'))
    const first = await ledger.append(sampleInput('stretch ratio raises orientation'))
    expect(first.deduped).toBe(false)
    expect(first.evidence.id).toMatch(/^EV-1-[0-9a-f]{4}$/u)
    const again = await ledger.append(sampleInput('stretch ratio raises orientation'))
    expect(again.deduped).toBe(true)
    expect(again.evidence.id).toBe(first.evidence.id)
    expect(ledger.all()).toHaveLength(1)
  })

  it('rebuilds from JSONL and verifies the intact chain', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-ledger-'))
    const file = join(dir, 'evidence.jsonl')
    const ledger = await EvidenceLedger.open(file)
    await ledger.append(sampleInput('observation A'))
    await ledger.append(sampleInput('observation B'))
    const reopened = await EvidenceLedger.open(file)
    expect(reopened.all()).toHaveLength(2)
    expect(reopened.verify()).toEqual({ verified: true, chainLength: 2 })
  })

  it('detects tampering at the exact record', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-ledger-'))
    const file = join(dir, 'evidence.jsonl')
    const ledger = await EvidenceLedger.open(file)
    const first = await ledger.append(sampleInput('honest record'))
    await ledger.append(sampleInput('second honest record'))
    const raw = await readFile(file, 'utf8')
    const tampered = raw.replace('honest record', 'TAMPERED RECORD')
    await writeFile(file, tampered, 'utf8')
    const attacked = await EvidenceLedger.open(file)
    const verdict = attacked.verify()
    expect(verdict.verified).toBe(false)
    expect(verdict.brokenAt).toBe(first.evidence.id)
  })
})
