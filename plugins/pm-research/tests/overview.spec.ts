/** Home pulse: the overview endpoint aggregates the numbers the workbench shows. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PmResearchEngine } from '../src/service.ts'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pm-overview-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('PmResearchEngine.overview', () => {
  it('starts empty and reports simulation availability', async () => {
    const engine = PmResearchEngine.open(await tempRoot())
    const overview = await engine.overview()
    expect(overview.totals).toEqual({
      projects: 0,
      evidence: 0,
      hypotheses: 0,
      supported: 0,
      refuted: 0,
      pendingKnowledge: 0,
    })
    expect(overview.projects).toEqual([])
    expect(overview.sim.analytic).toBe(true)
    expect(overview.sim.md).toBe(false)
  })

  it('aggregates evidence, hypotheses and pending knowledge cards', async () => {
    const root = await tempRoot()
    const engine = PmResearchEngine.open(root)
    const project = await engine.createProject({
      title: 'PVA 斜拉光学膜',
      question: '拉伸比如何影响双折射？',
      domain: 'pva-optical-film',
    }, 'test')
    await engine.recordEvidence(project.id, {
      claimSupport: 'draw ratio increases orientation',
      polarity: 'supports',
      strength: 'moderate',
      sourceRef: { type: 'doi', ref: '10.1000/pm-overview' },
      recordedBy: 'test',
    })
    await engine.proposeHypothesis(project.id, {
      statement: '取向诱导双折射',
      competitors: ['空洞散射'],
      mechanismEdgeIds: [],
      evidenceIds: [],
    }, 'test')
    await engine.knowledge().propose({
      scope: 'project',
      kind: 'fact',
      title: '斜拉条件窗口',
      body: 'T ∈ [80, 140] ℃',
    }, 'test')

    const overview = await engine.overview()
    expect(overview.totals).toMatchObject({
      projects: 1,
      evidence: 1,
      hypotheses: 1,
      supported: 0,
      refuted: 0,
      pendingKnowledge: 1,
    })
    expect(overview.projects).toEqual([{
      id: project.id,
      title: 'PVA 斜拉光学膜',
      status: 'active',
      evidence: 1,
      hypotheses: 1,
    }])
    expect(overview.sim.analytic).toBe(true)
  })
})
