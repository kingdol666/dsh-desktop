import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  KnowledgeStore,
  MechanismGraph,
  evaluateGate,
  purgeMechanismGraph,
} from '../src/index.ts'
import type { Evidence } from '@polymechanism/pm-domain'

function evidence(id: string, polarity: 'supports' | 'refutes' | 'neutral', strength: 'strong' | 'moderate' | 'weak'): Evidence {
  return {
    id,
    claimSupport: 'synthetic',
    polarity,
    strength,
    sourceRef: { type: 'run', ref: 'r' },
    hash: 'a'.repeat(64),
    recordedBy: 'test',
    recordedAt: '2026-11-20T00:00:00.000Z',
  }
}

describe('mechanism graph', () => {
  it('upserts nodes by name and merges aliases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-graph-'))
    const graph = MechanismGraph.open(join(dir, 'mechanism.json'))
    const first = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: '拉伸比', symbol: 'λ' })
    const second = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: '拉伸比', aliases: ['draw ratio'] })
    expect(first.id).toBe('MG-拉伸比')
    expect(second.id).toBe('MG-拉伸比')
    expect(second.aliases).toContain('draw ratio')
    const nodes = await graph.allNodes()
    expect(nodes).toHaveLength(1)
    await purgeMechanismGraph(join(dir, 'mechanism.json'))
  })

  it('demotes an established edge without theory source to candidate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-graph-'))
    const graph = MechanismGraph.open(join(dir, 'mechanism.json'))
    const a = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: '拉伸比' })
    const b = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'structure', name: '分子链取向' })
    const result = await graph.addEdge({
      projectId: 'PR-1-abcd',
      from: a.id,
      to: b.id,
      relation: 'increases',
      applicability: 'established',
      createdBy: 'agent',
      strongSupportingEvidence: 0,
    })
    expect(result.demotedToCandidate).toBe(true)
    expect(result.reason).toContain('theory source')
    expect(result.edge?.applicability).toBe('candidate')
    await purgeMechanismGraph(join(dir, 'mechanism.json'))
  })

  it('keeps established edges with theory source and strong evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-graph-'))
    const graph = MechanismGraph.open(join(dir, 'mechanism.json'))
    const a = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: '取向' })
    const b = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'property', name: '双折射' })
    const result = await graph.addEdge({
      projectId: 'PR-1-abcd',
      from: a.id,
      to: b.id,
      relation: 'determines',
      equation: '\\Delta n = f \\cdot \\Delta n_0 (dimensionless)',
      applicability: 'established',
      createdBy: 'seed',
      theorySource: { type: 'doi', ref: '10.1234/pva-optics' },
      strongSupportingEvidence: 2,
    })
    expect(result.demotedToCandidate).toBe(false)
    expect(result.edge?.applicability).toBe('established')
    expect(result.edge?.confidence).toBeGreaterThan(0.8)
    await purgeMechanismGraph(join(dir, 'mechanism.json'))
  })

  it('expands neighborhoods by name anchors and flags out-of-condition edges', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-graph-'))
    const graph = MechanismGraph.open(join(dir, 'mechanism.json'))
    const lambda = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: '拉伸比' })
    const f = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'structure', name: '取向' })
    const dn = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'property', name: '双折射' })
    await graph.addEdge({
      projectId: 'PR-1-abcd', from: lambda.id, to: f.id, relation: 'increases',
      applicability: 'candidate', createdBy: 'seed',
      conditions: { temperatureC: [80, 140] },
    })
    await graph.addEdge({
      projectId: 'PR-1-abcd', from: f.id, to: dn.id, relation: 'determines',
      applicability: 'candidate', createdBy: 'seed',
    })
    const result = await graph.query(['拉伸比'], 2, { temperatureC: 200 })
    expect(result.nodes.map(n => n.name)).toEqual(expect.arrayContaining(['拉伸比', '取向', '双折射']))
    expect(result.missingKnowledge.join(' ')).toContain('outside')
    const inRange = await graph.query(['拉伸比'], 2, { temperatureC: 105 })
    expect(inRange.missingKnowledge).toHaveLength(0)
    await purgeMechanismGraph(join(dir, 'mechanism.json'))
  })

  it('finds and scores paths between two nodes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-graph-'))
    const graph = MechanismGraph.open(join(dir, 'mechanism.json'))
    const a = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'condition', name: 'A' })
    const b = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'structure', name: 'B' })
    const c = await graph.upsertNode({ projectId: 'PR-1-abcd', type: 'property', name: 'C' })
    await graph.addEdge({ projectId: 'PR-1-abcd', from: a.id, to: b.id, relation: 'increases', applicability: 'candidate', createdBy: 'seed' })
    await graph.addEdge({ projectId: 'PR-1-abcd', from: b.id, to: c.id, relation: 'determines', applicability: 'established', createdBy: 'seed', theorySource: { type: 'doi', ref: '10.1/x' }, strongSupportingEvidence: 1 })
    const paths = await graph.pathSearch(a.id, c.id, 3)
    expect(paths.length).toBeGreaterThanOrEqual(1)
    expect(paths[0]?.nodes).toEqual([a.id, b.id, c.id])
    expect(paths[0]?.strength).toBeGreaterThan(0.4)
    await purgeMechanismGraph(join(dir, 'mechanism.json'))
  })
})

describe('knowledge cards (RSI)', () => {
  it('proposes pending cards and dedups identical title+body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-kb-'))
    const store = KnowledgeStore.open(dir)
    const first = await store.propose({
      scope: 'global',
      kind: 'pitfall',
      title: 'PVA 水含量改变 Tg',
      body: '测量前必须在 60℃ 真空干燥 12h，否则 Tg 偏低且取向结果不可比。',
    }, 'preset:polymer-physicist')
    expect(first.deduped).toBe(false)
    expect(first.card.status).toBe('pending')
    const again = await store.propose({
      scope: 'global',
      kind: 'pitfall',
      title: 'PVA 水含量改变 Tg',
      body: '测量前必须在 60℃ 真空干燥 12h，否则 Tg 偏低且取向结果不可比。',
    }, 'preset:polymer-physicist')
    expect(again.deduped).toBe(true)
    expect(again.card.id).toBe(first.card.id)
  })

  it('reject-only-with-rationale, approve records reviewer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-kb-'))
    const store = KnowledgeStore.open(dir)
    const { card } = await store.propose({ scope: 'project', kind: 'fact', title: 't', body: 'b' }, 'preset:x')
    expect(store.review(card.id, 'reject', 'human:pi', '')).rejects.toThrow('rationale')
    const approved = await store.review(card.id, 'approve', 'polymer-reviewer', 'consistent with textbook')
    expect(approved?.status).toBe('approved')
    expect(approved?.reviewedBy).toBe('polymer-reviewer')
    const pending = await store.query('project', 'pending')
    expect(pending).toHaveLength(0)
  })
})

describe('scientific gate', () => {
  it('blocks established edges without strong supporting evidence', () => {
    const verdict = evaluateGate({
      kind: 'edge',
      edge: {
        id: 'ED-1-abcd', projectId: 'PR-1-abcd', from: 'MG-a', to: 'MG-b',
        relation: 'determines', conditions: {}, applicability: 'established',
        confidence: 0.9, openQuestions: [], createdBy: 'agent', createdAt: '2026-11-20T00:00:00.000Z',
      },
      evidence: [evidence('EV-1-abcd', 'supports', 'weak')],
    })
    expect(verdict.verdict).toBe('block')
    expect(verdict.checks.some(c => c.rule === 'G-EVID' && !c.ok)).toBe(true)
  })

  it('warns when model params leave validRange', () => {
    const verdict = evaluateGate({
      kind: 'model-use',
      model: {
        id: 'kww', name: 'KWW', domain: 'rheology', equations: [],
        params: [{ name: 'beta' }],
        validRange: { beta: [0.2, 1.0] },
        implementation: { engine: 'mcp', tool: 'fit_relaxation' },
        status: 'validated',
      },
      params: { beta: 1.6 },
    })
    expect(verdict.verdict).toBe('warn')
    expect(verdict.checks.some(c => c.rule === 'G-RANGE' && !c.ok)).toBe(true)
  })

  it('checks Δn against the two-phase prediction when f and Δn0 are given', () => {
    const good = evaluateGate({ kind: 'optics', optics: { deltaN: 0.02, orientationFactor: 0.6, intrinsicBirefringence: 0.033 } })
    expect(good.checks.some(c => c.rule === 'G-OPTICS' && c.ok)).toBe(true)
    const bad = evaluateGate({ kind: 'optics', optics: { deltaN: 0.05, orientationFactor: 0.2, intrinsicBirefringence: 0.033 } })
    expect(bad.checks.some(c => c.rule === 'G-OPTICS' && !c.ok)).toBe(true)
  })

  it('requires an excluded competitor before concluding', () => {
    const verdict = evaluateGate({
      kind: 'claim',
      claim: '拉伸比主导幅值',
      competitors: [{ statement: '温度主导', excluded: false }],
      evidence: [evidence('EV-1-abcd', 'supports', 'strong')],
    })
    expect(verdict.verdict).toBe('warn')
    expect(verdict.checks.some(c => c.rule === 'G-COMPETE' && !c.ok)).toBe(true)
  })
})
