import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PmResearchEngine } from '../src/service.ts'
import { resolvePmDataRoot } from '../src/service.ts'

const SEED = join(__dirname, '..', '..', '..', 'knowledge', 'mechanism', 'seed.json')

describe('seed mechanism import (real seed.json)', () => {
  it('imports the full PVA oblique-stretching seed catalog', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pm-seed-'))
    const engine = PmResearchEngine.open(dir)
    const project = await engine.createProject({
      title: 'PVA 斜拉双折射判别',
      question: '斜拉角与拉伸比对双折射主轴与幅值的相对贡献',
      domain: 'pva-optical-film',
    }, 'human:pi')
    const result = await engine.importSeed(project.id, SEED)
    expect(result.nodes).toBe(23)
    expect(result.edges).toBeGreaterThanOrEqual(20)
    expect(result.skipped).toEqual([])

    const graph = engine.mechanismGraph(project.id)
    const nodes = await graph.allNodes()
    const edges = await graph.allEdges()
    expect(nodes.length).toBe(23)
    expect(edges.length).toBe(result.edges)

    // The two-phase optics relation must import as established.
    const established = edges.filter(edge => edge.applicability === 'established')
    expect(established.length).toBeGreaterThanOrEqual(5)
    expect(established.every(edge => edge.theorySource !== undefined)).toBe(true)

    // Neighborhood query with a real operating window must resolve the path.
    const query = await graph.query(['拉伸比', '斜拉角'], 2, { temperatureC: 105 })
    expect(query.nodes.length).toBeGreaterThanOrEqual(3)
    expect(query.missingKnowledge).toHaveLength(0)

    // Out-of-window query must flag the temperature window.
    const hot = await graph.query(['拉伸比'], 2, { temperatureC: 200 })
    expect(hot.missingKnowledge.join(' ')).toContain('outside')

    // Path search from draw ratio to birefringence must find the chain.
    const byId = new Map(nodes.map(node => [node.name, node.id]))
    const lambda = byId.get('拉伸比')
    const dn = byId.get('双折射')
    expect(lambda).toBeDefined()
    expect(dn).toBeDefined()
    const paths = await graph.pathSearch(lambda ?? '', dn ?? '', 4)
    expect(paths.length).toBeGreaterThanOrEqual(1)
    expect(paths[0]?.edges.length).toBeGreaterThanOrEqual(2)
  })

  it('resolves the pm data root from config over environment', () => {
    expect(resolvePmDataRoot({ dataRoot: '/tmp/x' })).toBe('/tmp/x')
  })
})
