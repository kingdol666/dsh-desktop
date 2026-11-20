/** Scientific integrity: gate conclusiveness, ledger chain linkage, and
 * write serialization (nothing here may silently pass or overwrite). */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EvidenceLedger } from '../src/evidence-ledger.ts'
import { evaluateGate } from '../src/gate.ts'
import { HypothesisStore } from '../src/hypothesis-store.ts'
import { KnowledgeStore } from '../src/knowledge.ts'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-integrity-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function evidenceInput(claim: string) {
  return {
    claimSupport: claim,
    polarity: 'supports' as const,
    strength: 'strong' as const,
    sourceRef: { type: 'doi' as const, ref: '10.1000/test' },
    recordedBy: 'preset:polymer-literature',
  }
}

describe('scientific gate conclusiveness', () => {
  it('blocks a claim that binds no evidence', () => {
    const verdict = evaluateGate({ kind: 'claim', evidence: [] })
    expect(verdict.verdict).toBe('block')
    expect(verdict.requiredEvidence.length).toBeGreaterThan(0)
  })

  it('blocks a conclusion with no declared competitor', () => {
    const verdict = evaluateGate({ kind: 'hypothesis', evidence: [], competitors: [] })
    expect(verdict.verdict).toBe('block')
    expect(verdict.checks.find(check => check.rule === 'G-COMPETE')?.ok).toBe(false)
  })

  it('warns when an established edge equation has no units', () => {
    const strongEvidence = {
      id: 'EV-1-abcd',
      claimSupport: 'edge holds in the tested window',
      polarity: 'supports' as const,
      strength: 'strong' as const,
      sourceRef: { type: 'doi' as const, ref: '10.1000/x' },
      hash: 'a'.repeat(64),
      recordedBy: 'preset:polymer-literature',
      recordedAt: '2026-01-01T00:00:00Z',
    }
    const verdict = evaluateGate({
      kind: 'edge',
      evidence: [strongEvidence],
      edge: {
        id: 'ED-1', projectId: 'PR-1', from: 'N-1', to: 'N-2', relation: 'increases',
        equation: 'f = 0.5 * lambda', conditions: {}, applicability: 'established',
        theorySource: { type: 'doi', ref: '10.1000/x' }, confidence: 0.9,
        openQuestions: [], evidenceIds: [], createdBy: 'human', createdAt: '2026-01-01T00:00:00Z',
      },
    })
    expect(verdict.checks.find(check => check.rule === 'G-UNIT')?.ok).toBe(false)
    expect(verdict.verdict).toBe('warn')
  })
})

describe('evidence ledger chain', () => {
  it('links every record to its predecessor and detects a deleted line', async () => {
    const root = await tempRoot()
    const path = join(root, 'evidence.jsonl')
    const ledger = await EvidenceLedger.open(path)
    await ledger.append(evidenceInput('first'))
    await ledger.append(evidenceInput('second'))
    await ledger.append(evidenceInput('third'))
    expect(ledger.verify().verified).toBe(true)

    // Remove the middle line: the third record's prevHash no longer matches.
    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    await writeFile(path, `${[lines[0], lines[2]].join('\n')}\n`, 'utf8')
    const reopened = await EvidenceLedger.open(path)
    const verdict = reopened.verify()
    expect(verdict.verified).toBe(false)
  })
})

describe('serialized writes', () => {
  it('keeps every concurrent hypothesis proposal', async () => {
    const root = await tempRoot()
    const store = HypothesisStore.open(root)
    await Promise.all(Array.from({ length: 6 }, (_, index) => store.propose(
      'PR-1',
      {
        statement: `concurrent ${String(index)}`,
        competitors: [],
        mechanismEdgeIds: [],
        evidenceIds: [],
        discriminatingTest: { design: 'd', observable: 'o', expectedIfTrue: 't', expectedIfFalse: 'f' },
      },
      index + 1,
      `000${String(index)}`,
      'preset:polymer-scientist',
    )))
    const items = await store.list('PR-1')
    expect(items).toHaveLength(6)
    expect(new Set(items.map(item => item.id)).size).toBe(6)
  })

  it('rejects reviewing a card twice and keeps ids unique across scopes', async () => {
    const root = await tempRoot()
    const store = KnowledgeStore.open(root)
    const project = await store.propose({ scope: 'project', kind: 'fact', title: 't', body: 'b' }, 'preset:polymer-literature')
    const global = await store.propose({ scope: 'global', kind: 'fact', title: 't', body: 'b' }, 'preset:polymer-literature')
    expect(project.card.id).not.toBe(global.card.id)
    const approved = await store.review(project.card.id, 'approve', 'preset:polymer-reviewer', 'ok')
    expect(approved?.status).toBe('approved')
    await expect(store.review(project.card.id, 'reject', 'preset:polymer-reviewer', 'no'))
      .rejects.toThrow(/already approved/u)
  })
})
