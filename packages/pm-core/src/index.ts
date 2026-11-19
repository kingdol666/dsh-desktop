/** PolyMechanism core: research engines over the domain vocabulary. */

import { PM_DOMAIN_VERSION } from '@polymechanism/pm-domain'

/** Version of the core engine contracts. */
export const PM_CORE_VERSION = 1 as const

/** Pair the domain vocabulary version with the core contract version for surface checks. */
export function pmSurfaceVersions(): { domain: typeof PM_DOMAIN_VERSION; core: typeof PM_CORE_VERSION } {
  return { domain: PM_DOMAIN_VERSION, core: PM_CORE_VERSION }
}

export * from './evidence-ledger.ts'
export * from './hypothesis-machine.ts'
export * from './hypothesis-store.ts'
export * from './project-store.ts'
