/** Mechanism graph: condition-aware physical-relation graph with evidence binding. */

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  EntityId,
  MechanismEdge,
  MechanismNode,
} from '@polymechanism/pm-domain'
import { edgePromotableToEstablished } from '@polymechanism/pm-domain'

/** Inputs for minting one node. */
export interface MechanismNodeInput {
  readonly projectId: EntityId
  readonly type: MechanismNode['type']
  readonly name: string
  readonly symbol?: string | undefined
  readonly unit?: string | undefined
  readonly aliases?: readonly string[] | undefined
}

/** Inputs for minting one edge. */
export interface MechanismEdgeInput {
  readonly projectId: EntityId
  readonly from: EntityId
  readonly to: EntityId
  readonly relation: MechanismEdge['relation']
  readonly equation?: string | undefined
  readonly conditions?: Readonly<Record<string, unknown>> | undefined
  readonly theorySource?: MechanismEdge['theorySource'] | undefined
  readonly applicability: 'candidate' | 'established'
  readonly createdBy: 'seed' | 'agent' | 'human'
  /** Ledger evidence bound to this edge (resolved by the caller). */
  readonly evidenceIds?: readonly EntityId[] | undefined
  /** Strong supporting evidence count (resolved by the caller from a ledger). */
  readonly strongSupportingEvidence?: number | undefined
}

/** One path through the graph returned by pathSearch. */
export interface MechanismPath {
  readonly nodes: readonly EntityId[]
  readonly edges: readonly EntityId[]
  /** Product of confidences along the path. */
  readonly strength: number
}

/** Result of a condition-aware neighborhood query. */
export interface MechanismQueryResult {
  readonly nodes: readonly MechanismNode[]
  readonly edges: readonly MechanismEdge[]
  readonly paths: readonly MechanismPath[]
  readonly missingKnowledge: readonly string[]
}

/** Project-scoped mechanism graph: one JSON file, in-memory index, atomic writes. */
export class MechanismGraph {
  private nodes: MechanismNode[] = []
  private edges: MechanismEdge[] = []
  private loaded = false

  private constructor(private readonly filePath: string) {}

  /**
   * Open (and lazily load) the graph file for one project.
   * @param filePath - absolute JSON path (usually `<projectDir>/mechanism.json`).
   */
  static open(filePath: string): MechanismGraph {
    return new MechanismGraph(filePath)
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as MechanismFile
      this.nodes = Array.isArray(parsed.nodes) ? [...parsed.nodes] : []
      this.edges = Array.isArray(parsed.edges) ? [...parsed.edges] : []
    } catch {
      this.nodes = []
      this.edges = []
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    const temp = `${this.filePath}.tmp`
    await writeFile(temp, `${JSON.stringify({ nodes: this.nodes, edges: this.edges }, null, 2)}\n`, 'utf8')
    await rename(temp, this.filePath)
  }

  /** All nodes (loaded on demand). */
  async allNodes(): Promise<readonly MechanismNode[]> {
    await this.ensureLoaded()
    return this.nodes
  }

  /** All edges. */
  async allEdges(): Promise<readonly MechanismEdge[]> {
    await this.ensureLoaded()
    return this.edges
  }

  /**
   * Insert or update a node matched by (name, projectId); aliases merge.
   * @param input - node fields; id derives from name hash.
   */
  async upsertNode(input: MechanismNodeInput): Promise<MechanismNode> {
    await this.ensureLoaded()
    const id = `MG-${input.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').slice(0, 24)}`
    const existing = this.nodes.find(node => node.id === id)
    if (existing !== undefined) {
      const aliases = new Set([...existing.aliases, ...(input.aliases ?? [])])
      const updated: MechanismNode = { ...existing, ...input, id, aliases: [...aliases] }
      this.nodes[this.nodes.indexOf(existing)] = updated
      await this.persist()
      return updated
    }
    const node: MechanismNode = {
      id,
      projectId: input.projectId,
      type: input.type,
      name: input.name,
      ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
      ...(input.unit === undefined ? {} : { unit: input.unit }),
      aliases: [...(input.aliases ?? [])],
    }
    this.nodes.push(node)
    await this.persist()
    return node
  }

  /**
   * Insert a new edge (never mutates an existing relation; conflicting edges
   * accumulate as separate candidates for review).
   * @param input - edge fields; promotion to `established` is gate-checked.
   */
  async addEdge(input: MechanismEdgeInput): Promise<{ edge?: MechanismEdge; demotedToCandidate: boolean; reason?: string }> {
    await this.ensureLoaded()
    let applicability = input.applicability
    let reason: string | undefined
    const promotable = edgePromotableToEstablished(
      input.theorySource !== undefined,
      input.strongSupportingEvidence ?? 0,
      input.createdBy,
    )
    if (applicability === 'established' && !promotable) {
      applicability = 'candidate'
      reason = 'established requires a theory source and at least one strong supporting evidence'
    }
    const ordinal = this.edges.length + 1
    const id = `ED-${ordinal}-${Math.abs(hashPair(input.from, input.to)).toString(16).slice(0, 4).padStart(4, '0')}`
    const edge: MechanismEdge = {
      id,
      projectId: input.projectId,
      from: input.from,
      to: input.to,
      relation: input.relation,
      ...(input.equation === undefined ? {} : { equation: input.equation }),
      conditions: { ...(input.conditions ?? {}) },
      applicability,
      ...(input.theorySource === undefined ? {} : { theorySource: input.theorySource }),
      confidence: applicability === 'established' ? 0.9 : 0.5,
      openQuestions: [],
      evidenceIds: [...(input.evidenceIds ?? [])],
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    }
    this.edges.push(edge)
    await this.persist()
    return { ...(edge === undefined ? {} : { edge }), demotedToCandidate: applicability === 'candidate' && input.applicability === 'established', ...(reason === undefined ? {} : { reason }) }
  }

  /**
   * Neighborhood expansion with condition filtering and anchor path search.
   * @param anchors - node ids or names to start/connect.
   * @param hops - expansion depth (default 2).
   * @param conditions - current operating window; edges outside it are flagged missing.
   * @param pathTo - optional destination node id/name; when omitted, paths are
   *   computed between every ordered anchor pair.
   */
  async query(
    anchors: readonly string[],
    hops: number,
    conditions: Readonly<Record<string, number>> | undefined,
    pathTo?: string,
  ): Promise<MechanismQueryResult> {
    await this.ensureLoaded()
    const resolveId = (value: string): EntityId | undefined => {
      const byId = this.nodes.find(node => node.id === value)
      if (byId !== undefined) return byId.id
      const byName = this.nodes.find(node =>
        node.name === value || node.aliases.includes(value) || node.symbol === value)
      return byName?.id
    }
    const anchorIds = new Set<EntityId>()
    for (const anchor of anchors) {
      const id = resolveId(anchor)
      if (id !== undefined) anchorIds.add(id)
    }
    const nodeIds = new Set<EntityId>(anchorIds)
    const frontier = new Set<EntityId>(anchorIds)
    const edgeIds = new Set<EntityId>()
    for (let depth = 0; depth < Math.max(0, hops); depth += 1) {
      const next: EntityId[] = []
      for (const edge of this.edges) {
        if (frontier.has(edge.from) || frontier.has(edge.to)) {
          if (!edgeIds.has(edge.id)) edgeIds.add(edge.id)
          if (!nodeIds.has(edge.from)) { nodeIds.add(edge.from); next.push(edge.from) }
          if (!nodeIds.has(edge.to)) { nodeIds.add(edge.to); next.push(edge.to) }
        }
      }
      for (const id of next) frontier.add(id)
    }
    const nodes = this.nodes.filter(node => nodeIds.has(node.id))
    const edges = this.edges.filter(edge => edgeIds.has(edge.id))
    const missing: string[] = []
    for (const edge of edges) {
      for (const [name, value] of Object.entries(edge.conditions)) {
        if (conditions !== undefined && conditions[name] !== undefined) {
          const window = parseWindow(value)
          if (window !== undefined && (conditions[name] < window.min || conditions[name] > window.max)) {
            missing.push(`${edge.id}: ${name}=${String(conditions[name])} outside [${window.min}, ${window.max}]`)
          }
        }
      }
    }
    const target = pathTo === undefined ? undefined : resolveId(pathTo)
    if (pathTo !== undefined && target === undefined) missing.push(`path target "${pathTo}" not found`)
    const starts = target === undefined ? [...anchorIds] : [...anchorIds].filter(id => id !== target)
    const ends = target === undefined ? [...anchorIds] : [target]
    const found: MechanismPath[] = []
    for (const from of starts) {
      for (const to of ends) {
        if (from === to) continue
        found.push(...await this.pathSearch(from, to, Math.max(1, hops)))
      }
    }
    const seen = new Set<string>()
    const paths = found
      .sort((left, right) => right.strength - left.strength)
      .filter(path => {
        const key = path.edges.join('>')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 8)
    if (pathTo !== undefined && paths.length === 0 && starts.length > 0) {
      missing.push(`no directed path <= ${String(hops)} hops from anchors to "${pathTo}"`)
    }
    return { nodes, edges, paths, missingKnowledge: missing }
  }

  /**
   * BFS path search between two nodes, ≤maxHops edges, scored by confidence product.
   * @param from - start node id.
   * @param to - end node id.
   * @param maxHops - maximum edges on a returned path.
   */
  async pathSearch(from: EntityId, to: EntityId, maxHops: number): Promise<readonly MechanismPath[]> {
    await this.ensureLoaded()
    const results: MechanismPath[] = []
    const walk = (current: EntityId, pathNodes: EntityId[], pathEdges: EntityId[], depth: number): void => {
      if (depth > maxHops) return
      if (current === to && pathEdges.length > 0) {
        const strength = pathEdges.reduce((product, id) => {
          const edge = this.edges.find(candidate => candidate.id === id)
          return product * (edge?.confidence ?? 0.1)
        }, 1.0)
        results.push({ nodes: [...pathNodes], edges: [...pathEdges], strength })
        return
      }
      if (pathNodes.length > maxHops + 1) return
      for (const edge of this.edges) {
        if (edge.from !== current) continue
        if (pathNodes.includes(edge.to)) continue
        walk(edge.to, [...pathNodes, edge.to], [...pathEdges, edge.id], depth + 1)
      }
    }
    walk(from, [from], [], 0)
    return results.sort((a, b) => b.strength - a.strength).slice(0, 8)
  }
}

/** Remove the graph file (test helper only). */
export async function purgeMechanismGraph(filePath: string): Promise<void> {
  await rm(filePath, { force: true })
}

function hashPair(from: string, to: string): number {
  let hash = 0
  const key = `${from}->${to}`
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function parseWindow(value: unknown): { min: number; max: number } | undefined {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return { min: value[0], max: value[1] }
  }
  return undefined
}
