/** Hypothesis store: one JSON file per project under `<dataRoot>/hypotheses/`. */

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { EntityId, Hypothesis, HypothesisStatus } from '@polymechanism/pm-domain'
import { attemptHypothesisMove, type GateEvidenceItem, type HypothesisMoveVerdict } from './hypothesis-machine.ts'

/** Inputs that mint one hypothesis (projectId travels as the explicit argument). */
export type ProposeHypothesisInput = Omit<Hypothesis, 'id' | 'status' | 'transitions' | 'projectId'>

/** JSON-file persistence for hypotheses with machine-gated transitions. */
export class HypothesisStore {
  private constructor(private readonly root: string) {}

  /**
   * Open the hypothesis store rooted at `root` (usually `<dataRoot>/hypotheses`).
   * @param root - absolute directory holding one JSON file per project.
   */
  static open(root: string): HypothesisStore {
    return new HypothesisStore(root)
  }

  private file(projectId: EntityId): string {
    return join(this.root, `${projectId}.json`)
  }

  private async readProject(projectId: EntityId): Promise<Hypothesis[]> {
    try {
      const raw = await readFile(this.file(projectId), 'utf8')
      return JSON.parse(raw) as Hypothesis[]
    } catch {
      return []
    }
  }

  private async writeProject(projectId: EntityId, items: Hypothesis[]): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const final = this.file(projectId)
    const temp = join(this.root, `.${projectId}.json.tmp`)
    await writeFile(temp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    await rename(temp, final)
  }

  /** All hypotheses of one project in proposal order. */
  async list(projectId: EntityId): Promise<Hypothesis[]> {
    return this.readProject(projectId)
  }

  /**
   * Mint one hypothesis with status `proposed` and an empty transition log.
   * @param projectId - owning project.
   * @param input - hypothesis fields.
   * @param ordinal - next hypothesis ordinal within the project.
   * @param hash4 - four hex chars from the statement digest for the id.
   * @param actor - proposing actor identity.
   */
  async propose(
    projectId: EntityId,
    input: ProposeHypothesisInput,
    ordinal: number,
    hash4: string,
    actor: string,
  ): Promise<Hypothesis> {
    const items = await this.readProject(projectId)
    const hypothesis: Hypothesis = {
      projectId,
      ...input,
      id: `HY-${ordinal}-${hash4}`,
      status: 'proposed',
      transitions: [{
        from: null,
        to: 'proposed',
        rationale: 'hypothesis proposed',
        evidenceIds: input.evidenceIds,
        at: new Date().toISOString(),
        actor,
      }],
    }
    items.push(hypothesis)
    await this.writeProject(projectId, items)
    return hypothesis
  }

  /**
   * Attempt one machine-gated transition and persist it on success.
   * @param projectId - owning project.
   * @param hypothesisId - target hypothesis.
   * @param to - requested status.
   * @param rationale - required reason.
   * @param evidence - gate-relevant evidence items resolved by the caller.
   * @param actor - requesting actor.
   */
  async transition(
    projectId: EntityId,
    hypothesisId: EntityId,
    to: HypothesisStatus,
    rationale: string,
    evidence: readonly GateEvidenceItem[],
    actor: string,
  ): Promise<HypothesisMoveVerdict & { readonly hypothesis?: Hypothesis }> {
    const items = await this.readProject(projectId)
    const index = items.findIndex(item => item.id === hypothesisId)
    if (index < 0) return { legal: false, reason: `hypothesis ${hypothesisId} not found` }
    const current = items[index] as Hypothesis
    const verdict = attemptHypothesisMove({
      from: current.status,
      to,
      rationale,
      evidence,
      actor,
      at: new Date().toISOString(),
      ...(current.discriminatingTest === undefined ? {} : { discriminatingTest: current.discriminatingTest }),
    })
    if (!verdict.legal) return verdict
    const updated: Hypothesis = { ...current, status: to, transitions: [...current.transitions, verdict.transition] }
    items[index] = updated
    await this.writeProject(projectId, items)
    return { ...verdict, hypothesis: updated }
  }

  /** Remove the store directory (test helper only). */
  async __purgeForTests(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
  }
}
