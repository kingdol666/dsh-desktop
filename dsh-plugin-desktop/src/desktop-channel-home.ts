/**
 * Per-channel DSH home resolution.
 *
 * Stable and Beta historically shared `~/.dsh`. Sharing one home also shares
 * `profiles/node_modules`, the installation-wide module index that each core
 * generation rewrites on startup, so a Profile scan that runs between two
 * rewrites can read a half-healed index and report installed plugins as
 * missing. Each channel therefore owns a home directory name.
 *
 * Existing installations are never moved implicitly: when this channel's own
 * home does not exist yet and the shared home is already a usable DSH home,
 * the shared home stays in use and the caller reports the overlap instead.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { validDesktopProfileExists } from './desktop-data-directory.ts'
import {
  DESKTOP_PRODUCT_IDENTITY,
  DESKTOP_RELEASE_IDENTITIES,
  type DesktopProductIdentity,
} from './product-identity.ts'

export type DesktopChannelHomeStatus =
  /** `DSH_HOME` named a home explicitly; the channel never overrides it. */
  | 'explicit'
  /** This channel's own home is in use. */
  | 'channel'
  /** The pre-split shared home is in use because it already holds real data. */
  | 'legacy-shared'

export interface DesktopChannelHomeResolution {
  /** Home to use when Desktop has no recorded data directory of its own. */
  readonly homeDir: string
  /** Home directory this release channel owns. */
  readonly channelHome: string
  /** Home both channels used before per-channel homes existed. */
  readonly legacyHome: string
  readonly status: DesktopChannelHomeStatus
}

export interface DesktopChannelHomeOptions {
  readonly identity?: DesktopProductIdentity
  readonly environment?: NodeJS.ProcessEnv
  readonly homeDirectory?: string
  /** Probe overridden by tests; reports whether a path is a usable DSH home. */
  readonly homeInUse?: (path: string) => boolean
}

/** Resolve the home directory a release channel owns, without touching disk. */
export function desktopChannelHome(
  identity: DesktopProductIdentity = DESKTOP_PRODUCT_IDENTITY,
  homeDirectory: string = homedir(),
): string {
  return resolve(join(homeDirectory, identity.homeDirectoryName))
}

/** Home this channel used before the product rename, when it declares one. */
export function desktopLegacyChannelHome(
  identity: DesktopProductIdentity = DESKTOP_PRODUCT_IDENTITY,
  homeDirectory: string = homedir(),
): string | undefined {
  const name = identity.legacyHomeDirectoryName
  return name === undefined ? undefined : resolve(join(homeDirectory, name))
}

/**
 * Copy the pre-rename home into the product home once.
 *
 * Runs only when the product home does not exist yet, so a later launch never
 * re-copies over live data. A failed copy leaves the caller on the legacy home:
 * starting with the old data beats failing to start.
 * @returns whether the product home now exists.
 */
export function migrateLegacyChannelHome(channelHome: string, legacyHome: string): boolean {
  const marker = join(channelHome, '.migrated-from-legacy-home')
  if (!existsSync(legacyHome) || existsSync(marker)) return false
  let copied = false
  if (process.platform === 'win32') {
    // Windows MAX_PATH: Node's recursive copy gives up on deep node_modules
    // trees; robocopy handles long paths natively and merges into a partial
    // destination. Exit codes < 8 mean success.
    try {
      execFileSync('robocopy', [
        legacyHome, channelHome, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XJ',
      ], { stdio: 'ignore' })
      copied = true
    } catch (error) {
      const status = (error as { status?: number }).status
      copied = typeof status === 'number' && status < 8
    }
  }
  if (!copied) {
    try {
      cpSync(legacyHome, channelHome, { recursive: true, force: false, errorOnExist: false })
      copied = true
    } catch {
      copied = false
    }
  }
  if (!copied) return false
  try {
    writeFileSync(marker, `${legacyHome}\n${new Date().toISOString()}\n`)
  } catch {
    // The marker is diagnostic only; the data is what matters.
  }
  return true
}

/** Decide which home this launch uses before any Desktop selection is read. */
export function resolveDesktopChannelHome(
  options: DesktopChannelHomeOptions = {},
): DesktopChannelHomeResolution {
  const {
    identity = DESKTOP_PRODUCT_IDENTITY,
    environment = process.env,
    homeDirectory = homedir(),
    homeInUse = validDesktopProfileExists,
  } = options
  const channelHome = desktopChannelHome(identity, homeDirectory)
  // A renamed channel's legacy home is its own pre-rename directory; channels
  // without one (Beta) share the Stable channel home as before.
  const legacyHome = desktopLegacyChannelHome(identity, homeDirectory)
    ?? desktopChannelHome(DESKTOP_RELEASE_IDENTITIES.stable, homeDirectory)
  const configured = environment.DSH_HOME
  if (configured !== undefined && configured.trim().length > 0) {
    return Object.freeze({
      homeDir: resolveDshHome(undefined, environment),
      channelHome,
      legacyHome,
      status: 'explicit',
    })
  }
  // The channel that owns the shared home has nothing to decide.
  if (channelHome === legacyHome) {
    return Object.freeze({ homeDir: channelHome, channelHome, legacyHome, status: 'channel' })
  }
  // Product rename: adopt the pre-rename home once so sessions, profiles, and
  // credentials continue under the new directory instead of being orphaned.
  const previousHome = desktopLegacyChannelHome(identity, homeDirectory)
  if (previousHome !== undefined && previousHome !== channelHome
    && !homeInUse(channelHome) && homeInUse(previousHome)) {
    if (migrateLegacyChannelHome(channelHome, previousHome)) {
      return Object.freeze({ homeDir: channelHome, channelHome, legacyHome, status: 'channel' })
    }
    return Object.freeze({ homeDir: previousHome, channelHome, legacyHome, status: 'legacy-shared' })
  }
  // Keep an installed channel where its data already lives.
  if (!homeInUse(channelHome) && homeInUse(legacyHome)) {
    return Object.freeze({ homeDir: legacyHome, channelHome, legacyHome, status: 'legacy-shared' })
  }
  return Object.freeze({ homeDir: channelHome, channelHome, legacyHome, status: 'channel' })
}

/**
 * Report whether this launch should offer to move onto the channel home.
 * Only an unchosen home qualifies: an explicit `DSH_HOME` and a directory the
 * user already picked in Recovery both stay untouched.
 */
export function desktopSharedHomeNoticeRequired(
  resolution: DesktopChannelHomeResolution,
  source: 'default' | 'environment' | 'desktop',
): boolean {
  return source === 'default' && resolution.status === 'legacy-shared'
}
