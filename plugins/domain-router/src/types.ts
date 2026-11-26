/** Shared domain vocabulary and result shapes for the domain router. */

/** One workspace domain declaration (domains/<id>/domain.json). */
export interface DomainConfig {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly description: string
  readonly keywords: readonly string[]
  /** Absolute KB directory resolved from the workspace. */
  readonly kbRoot: string
  /** Absolute notes KB directory, when declared. */
  readonly notesRoot?: string
  readonly zoteroCollection?: string
  readonly litProject?: string
  readonly allowedKinds: readonly string[]
  readonly defaultKind: string
  readonly relatedDomains: readonly string[]
  readonly priority: number
}

/** Merged workspace + global registry. */
export interface DomainRegistry {
  readonly workspace: string
  readonly domains: readonly DomainConfig[]
  readonly defaultDomain?: string
  readonly warnings: readonly string[]
}

/** Active domain state persisted at <workspace>/.pm-domain/state.json. */
export interface DomainState {
  readonly schemaVersion: 1
  readonly domain: string
  readonly projectId?: string
  readonly updatedAt: string
}

/** Classifier result for one question. */
export interface DomainRouteResult {
  readonly ok: true
  readonly domain: string | null
  readonly domainName: string | null
  readonly confidence: number
  readonly evidence: readonly string[]
  readonly alternatives: readonly DomainAlternative[]
  readonly relatedDomains: readonly string[]
  readonly kbRoot: string | null
  readonly collection: string | null
  readonly litProject: string | null
  readonly needsConfirmation: boolean
  readonly question?: string
}

/** One alternative domain with its raw score. */
export interface DomainAlternative {
  readonly id: string
  readonly name: string
  readonly score: number
}
