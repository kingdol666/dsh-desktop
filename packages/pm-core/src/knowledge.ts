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

  /** Per-scope write queue: propose/review must not interleave. */
  private readonly queues = new Map<KnowledgeCard['scope'], Promise<unknown>>()

  private serialize<T>(scope: KnowledgeCard['scope'], task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(scope) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(scope, next.catch(() => undefined))
    return next
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
    return this.serialize(input.scope, async () => {
      const items = await this.readScope(input.scope)
      const digest = createHash('sha256').update(`${input.title}\n${input.body}`).digest('hex')
      for (const existing of items) {
        const other = createHash('sha256').update(`${existing.title}\n${existing.body}`).digest('hex')
        if (other === digest && existing.status !== 'rejected') {
          return { card: existing, deduped: true }
        }
      }
      // Scope prefix keeps ids unique when a project and the global store hold
      // the same card ordinal and digest.
      const scopePrefix = input.scope === 'global' ? 'g' : input.scope === 'project' ? 'p' : 'a'
      const id = `KC-${scopePrefix}-${items.length + 1}-${digest.slice(0, 4)}` as EntityId
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
    })
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
      if (!items.some(card => card.id === cardId)) continue
      return this.serialize(scope, async () => {
        const current = await this.readScope(scope)
        const index = current.findIndex(card => card.id === cardId)
        if (index < 0) return undefined
        const existing = current[index] as KnowledgeCard
        if (decision === 'reject' && rationale.trim().length === 0) {
          throw new Error('reject requires a rationale')
        }
        // Only pending cards can be decided; superseding requires an approved card.
        if (decision === 'supersede' && existing.status !== 'approved') {
          throw new Error(`supersede requires an approved card, ${cardId} is ${existing.status}`)
        }
        if (decision !== 'supersede' && existing.status !== 'pending') {
          throw new Error(`card ${cardId} is already ${existing.status}; only pending cards can be reviewed`)
        }
        const updated: KnowledgeCard = {
          ...existing,
          status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'superseded',
          reviewedBy: reviewer,
          reviewedAt: new Date().toISOString(),
          ...(rationale.length > 0 ? { reviewRationale: rationale } : {}),
        }
        current[index] = updated
        await this.writeScope(scope, current)
        return updated
      })
    }
    return undefined
  }

  /** Remove the store directory (test helper only). */
  async __purgeForTests(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
  }
}
