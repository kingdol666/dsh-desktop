/** Knowledge cards: reviewable RSI units with pending→approved review loop. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { EntityId, KnowledgeCard } from '@polymechanism/pm-domain'

/** Inputs that mint one card (origin filled by the store). */
export interface KnowledgeCardInput {
  readonly scope: KnowledgeCard['scope']
  readonly kind: KnowledgeCard['kind']
  readonly title: string
  readonly body: string
  readonly links?: KnowledgeCard['links'] | undefined
}

/** Decision for one review action. */
export type KnowledgeReviewDecision = 'approve' | 'reject' | 'supersede'

/** File name of the per-scope card collection. */
const CARDS_FILE = 'cards.json'

/** JSON knowledge-card store: `<root>/<scope>/cards.json`, atomic writes. */
export class KnowledgeStore {
  private caches = new Map<KnowledgeCard['scope'], KnowledgeCard[]>()
  private loaded = new Set<KnowledgeCard['scope']>()

  private constructor(private readonly root: string) {}

  /**
   * Open the knowledge store rooted at `root`.
   * @param root - absolute directory (one cards.json per scope).
   */
  static open(root: string): KnowledgeStore {
    return new KnowledgeStore(root)
  }

  private file(scope: KnowledgeCard['scope']): string {
    return join(this.root, scope, CARDS_FILE)
  }

  private async readScope(scope: KnowledgeCard['scope']): Promise<KnowledgeCard[]> {
    const cached = this.caches.get(scope)
    if (cached !== undefined) return cached
    let items: KnowledgeCard[] = []
    try {
      items = JSON.parse(await readFile(this.file(scope), 'utf8')) as KnowledgeCard[]
    } catch {
      items = []
    }
    this.caches.set(scope, items)
    this.loaded.add(scope)
    return items
  }

  private async writeScope(scope: KnowledgeCard['scope'], items: KnowledgeCard[]): Promise<void> {
    await mkdir(dirname(this.file(scope)), { recursive: true })
    const final = this.file(scope)
    const temp = `${final}.tmp`
    await writeFile(temp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    await rename(temp, final)
    this.caches.set(scope, items)
    this.loaded.add(scope)
  }

  /** All cards across scopes in storage order. */
  async all(): Promise<readonly KnowledgeCard[]> {
    const global = await this.readScope('global')
    const project = await this.readScope('project')
    const agent = await this.readScope('agent')
    return [...global, ...project, ...agent]
  }

  /** Cards within one scope, optionally filtered by status. */
  async query(scope: KnowledgeCard['scope'], status?: KnowledgeCard['status']): Promise<readonly KnowledgeCard[]> {
    const items = await this.readScope(scope)
    return items.filter(card => status === undefined || card.status === status)
  }

  /**
   * Propose one card with status `pending`; duplicate title+body digest dedups.
   * @param input - card fields.
   * @param originAgent - proposing agent identity.
   */
  async propose(input: KnowledgeCardInput, originAgent: string): Promise<{ card: KnowledgeCard; deduped: boolean }> {
    const items = await this.readScope(input.scope)
    const digest = createHash('sha256').update(`${input.title}\n${input.body}`).digest('hex')
    for (const existing of items) {
      const other = createHash('sha256').update(`${existing.title}\n${existing.body}`).digest('hex')
      if (other === digest && existing.status !== 'rejected') {
        return { card: existing, deduped: true }
      }
    }
    const id = `KC-${items.length + 1}-${digest.slice(0, 4)}` as EntityId
    const card: KnowledgeCard = {
      id,
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      body: input.body,
      links: input.links ?? {},
      status: 'pending',
      origin: { agent: originAgent, at: new Date().toISOString() },
    }
    items.push(card)
    await this.writeScope(input.scope, items)
    return { card, deduped: false }
  }

  /**
   * Apply one review decision.
   * @param cardId - target card.
   * @param decision - approve/reject/supersede.
   * @param reviewer - reviewer identity.
   * @param rationale - required for reject.
   */
  async review(cardId: EntityId, decision: KnowledgeReviewDecision, reviewer: string, rationale: string): Promise<KnowledgeCard | undefined> {
    for (const scope of ['global', 'project', 'agent'] as const) {
      const items = await this.readScope(scope)
      const index = items.findIndex(card => card.id === cardId)
      if (index < 0) continue
      const existing = items[index] as KnowledgeCard
      if (decision === 'supersede') return undefined
      if (decision === 'reject' && rationale.trim().length === 0) {
        throw new Error('reject requires a rationale')
      }
      const updated: KnowledgeCard = {
        ...existing,
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewedBy: reviewer,
        reviewedAt: new Date().toISOString(),
        ...(rationale.length > 0 ? { reviewRationale: rationale } : {}),
      }
      items[index] = updated
      await this.writeScope(scope, items)
      return updated
    }
    return undefined
  }

  /** Remove the store directory (test helper only). */
  async __purgeForTests(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
  }
}
