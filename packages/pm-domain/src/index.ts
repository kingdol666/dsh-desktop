/** PolyMechanism domain: entity vocabulary and identifier rules (no runtime dependencies). */

/** Version of the domain vocabulary. Bump only for breaking entity-shape changes. */
export const PM_DOMAIN_VERSION = 1 as const

/** Every addressable research entity kind. */
export type EntityKind =
  | 'project'
  | 'observation'
  | 'evidence'
  | 'hypothesis'
  | 'mechanism-node'
  | 'mechanism-edge'
  | 'model'
  | 'knowledge-card'
  | 'objection'

/** Stable entity identifier: `<PREFIX>-<ordinal>-<hash4>` (see 05-系统架构设计.md §3.1). */
export type EntityId = string

/** Prefixes reserved per entity kind; extensions require a new invariant test. */
export const ENTITY_PREFIXES: Readonly<Record<EntityKind, string>> = Object.freeze({
  project: 'PR',
  observation: 'OB',
  evidence: 'EV',
  hypothesis: 'HY',
  'mechanism-node': 'MG',
  'mechanism-edge': 'ED',
  model: 'MD',
  'knowledge-card': 'KC',
  objection: 'OJ',
})

const ENTITY_ID_PATTERN = /^[A-Z]{2}-\d{1,8}-[0-9a-f]{4}$/u

/**
 * Whether `value` is a well-formed entity identifier of the given kind.
 * @param value - candidate identifier.
 * @param kind - expected entity kind.
 */
export function isEntityId(value: string, kind: EntityKind): boolean {
  if (!ENTITY_ID_PATTERN.test(value)) return false
  return value.startsWith(`${ENTITY_PREFIXES[kind]}-`)
}
