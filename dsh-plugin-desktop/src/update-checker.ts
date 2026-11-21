/** Headless version checks against the public GitHub Releases of the fork. */

import {
  assertDesktopInstallationId,
  DESKTOP_INSTALLATION_ID_HEADER,
  type DesktopInstallationId,
} from './desktop-installation-id.ts'
import { isGitHubApiHost, parsePublicHttpsUrl } from './update-hosts.ts'

/**
 * GitHub Releases list for this fork. The newest non-draft release whose tag
 * parses as the channel's canonical SemVer is the latest version; its assets
 * are the installer artifacts the download path consumes.
 */
export const DESKTOP_GITHUB_OWNER = 'kingdol666'
export const DESKTOP_GITHUB_REPO = 'dsh-desktop'
export const DESKTOP_VERSION_ENDPOINT =
  `https://api.github.com/repos/${DESKTOP_GITHUB_OWNER}/${DESKTOP_GITHUB_REPO}/releases?per_page=15`

/** Headers GitHub's REST API expects on every release-list request. */
export const DESKTOP_GITHUB_ACCEPT = 'application/vnd.github+json'
export const DESKTOP_GITHUB_API_VERSION = '2022-11-28'

/** Header carrying the installed Desktop version to the fixed version endpoint. */
export const DESKTOP_CURRENT_VERSION_HEADER = 'X-DSH-Desktop-Version'

/** Header selecting an isolated Desktop release stream. */
export const DESKTOP_RELEASE_CHANNEL_HEADER = 'X-DSH-Desktop-Channel'

/** Release streams supported by the Desktop service. */
export type DesktopReleaseChannel = 'stable' | 'beta' | 'next'

/** Maximum response body bytes accepted from the releases-list endpoint. */
export const MAX_VERSION_RESPONSE_BYTES = 1024 * 1024

/** One downloadable installer artifact published on a GitHub release. */
export interface DesktopReleaseAsset {
  /** Asset file name as published (e.g. `PolyMechanism-Studio-2.2.0-x64-Setup.exe`). */
  readonly name: string
  /** Browser download URL (HTTPS, redirects to the release-assets CDN). */
  readonly url: string
  /** Declared asset size in bytes, when the API reports one. */
  readonly size?: number
  /** Hex SHA-256 when the API publishes an asset `digest` of the form `sha256:<hex>`. */
  readonly sha256?: string
}

/** Per-platform installer assets resolved from one release. */
export type DesktopInstallerAssets = Readonly<Partial<Record<'win32' | 'darwin', DesktopReleaseAsset>>>

/** One parsed GitHub release entry relevant to Desktop update flows. */
export interface DesktopRelease {
  /** Canonical SemVer parsed from the release tag (leading `v` stripped). */
  readonly version: string
  /** Parsed tag components, reused for precedence comparisons. */
  readonly parsed: ParsedSemVer
  /** Whether the release is marked draft (never selectable). */
  readonly draft: boolean
  /** Whether the release is marked prerelease on GitHub. */
  readonly prerelease: boolean
  /** Release page URL (`html_url`), when GitHub reports an HTTPS page. */
  readonly releaseUrl?: string
  /** Installer assets for the Desktop download platforms. */
  readonly assets: DesktopInstallerAssets
}

/** Strictly parsed SemVer components. Numeric components remain strings to avoid overflow. */
export interface ParsedSemVer {
  /** Canonical version without the optional leading `v`. */
  readonly version: string
  /** Major numeric identifier. */
  readonly major: string
  /** Minor numeric identifier. */
  readonly minor: string
  /** Patch numeric identifier. */
  readonly patch: string
  /** Ordered prerelease identifiers, or an empty list for a stable version. */
  readonly prerelease: readonly string[]
  /** Build identifiers, ignored for version precedence. */
  readonly build: readonly string[]
}

/** Fetch-compatible request function used by the headless checker. */
export type UpdateRequest = (url: string, init: RequestInit) => Promise<Response>

/** Inputs for one channel-scoped version check. */
export interface UpdateCheckOptions {
  /** Installed application version, expressed as canonical SemVer. */
  readonly currentVersion: string
  /** Release stream that must be returned by the service. */
  readonly channel: DesktopReleaseChannel
  /** Channel of the installed application when explicitly switching streams. */
  readonly currentChannel?: DesktopReleaseChannel
  /** Treat a different older version as selectable for an explicit channel switch. */
  readonly allowDowngrade?: boolean
  /** Caller-owned cancellation signal; the checker does not create its own timeout. */
  readonly signal?: AbortSignal
  /** Optional fetch implementation for a host adapter or test. */
  readonly request?: UpdateRequest
  /** Installation UUID attached only to the fixed version-check endpoint. */
  readonly installationId?: DesktopInstallationId
}

/** Successful comparison returned by the stable version service. */
export type UpdateCheckResult = {
  /** Whether the service reports a version newer than the installed application. */
  readonly status: 'up-to-date' | 'update-available'
  /** Canonical installed version, including any prerelease identifiers. */
  readonly currentVersion: string
  /** Canonical latest stable version returned by the service. */
  readonly latestVersion: string
  /** Release page URL for the selected release, when the API reports one. */
  readonly releaseUrl?: string
  /**
   * Per-platform installer assets published on the selected release. The
   * download path consumes the matching platform's `url` directly.
   */
  readonly installerAssets?: DesktopInstallerAssets
  /**
   * Optional per-platform hex SHA-256 digests of the published installers.
   * Whenever the API publishes asset digests, the download path enforces them
   * as a hard integrity gate before execution.
   */
  readonly installerSha256?: Readonly<Partial<Record<'win32' | 'darwin', string>>>
}

const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u

/**
 * Parse strict SemVer with an optional lowercase `v` prefix.
 * @param input - complete version or release tag.
 * @returns parsed identifiers, or null when the input is not valid SemVer.
 */
export function parseSemVer(input: string): ParsedSemVer | null {
  const version = input.startsWith('v') ? input.slice(1) : input
  const match = SEMVER_PATTERN.exec(version)
  if (match === null) return null

  const prerelease = match[4]?.split('.') ?? []
  if (prerelease.some(identifier => isNumeric(identifier) && hasLeadingZero(identifier))) return null

  return {
    version,
    major: match[1]!,
    minor: match[2]!,
    patch: match[3]!,
    prerelease,
    build: match[5]?.split('.') ?? [],
  }
}

/**
 * Compare two strict SemVer strings without numeric overflow.
 * @param left - first strict SemVer value.
 * @param right - second strict SemVer value.
 * @returns negative, zero, or positive precedence, or null when either value is invalid.
 */
export function compareSemVerVersions(left: string, right: string): number | null {
  const leftVersion = parseSemVer(left)
  const rightVersion = parseSemVer(right)
  if (leftVersion === null || rightVersion === null) return null
  return compareParsedSemVer(leftVersion, rightVersion)
}

/**
 * Check the fork's GitHub Releases for the latest release in one channel.
 * @param options - installed version, caller-owned signal, and optional request adapter.
 * @returns a successful comparison, or null when any request or validation step fails.
 */
export async function checkForDesktopUpdate(
  options: UpdateCheckOptions,
): Promise<UpdateCheckResult | null> {
  const current = parseCanonicalChannelVersion(
    options.currentVersion,
    options.currentChannel ?? options.channel,
  )
  if (current === null) return null

  let headers: HeadersInit
  try {
    headers = desktopVersionRequestHeaders(options.installationId, current.version, options.channel)
  } catch {
    return null
  }

  const init: RequestInit = {
    method: 'GET',
    headers,
    cache: 'no-store',
    // A renamed GitHub repository answers the old API path with 301 to
    // `/repositories/<id>/...`; follow it, then pin the settled URL below.
    redirect: 'follow',
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
  const request = options.request ?? defaultRequest

  let response: Response
  try {
    response = await request(DESKTOP_VERSION_ENDPOINT, init)
  } catch {
    return null
  }
  if (response.status !== 200) return null
  // `Response.url` is the settled URL after redirects (Node/undici and
  // Electron net.fetch). When present it must stay on GitHub's public API
  // host so a tampered redirect cannot exfiltrate the installation ID.
  if (response.url !== '') {
    const finalUrl = parsePublicHttpsUrl(response.url)
    if (finalUrl === null || !isGitHubApiHost(finalUrl.hostname)) return null
  }

  let body: string
  try {
    body = await readLimitedBody(response)
  } catch {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return null
  }
  const releases = parseDesktopReleasesList(payload)
  const selected = pickDesktopReleaseForChannel(releases, options.channel)
  if (selected === null) return null
  const comparison = compareParsedSemVer(selected.parsed, current)
  const installerSha256 = releaseInstallerDigests(selected.assets)
  return {
    status: comparison > 0 || (options.allowDowngrade === true && comparison !== 0)
      ? 'update-available'
      : 'up-to-date',
    currentVersion: current.version,
    latestVersion: selected.version,
    ...(selected.releaseUrl === undefined ? {} : { releaseUrl: selected.releaseUrl }),
    ...(Object.keys(selected.assets).length === 0 ? {} : { installerAssets: selected.assets }),
    ...(installerSha256 === undefined ? {} : { installerSha256 }),
  }
}

/** Backward-compatible stable-channel entry point for existing callers. */
export function checkForStableUpdate(
  options: Omit<UpdateCheckOptions, 'channel'>,
): Promise<UpdateCheckResult | null> {
  return checkForDesktopUpdate({ ...options, channel: 'stable' })
}

/** Build the complete header set for the releases-list request only. */
export function desktopVersionRequestHeaders(
  installationId?: string,
  currentVersion?: string,
  channel?: DesktopReleaseChannel,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: DESKTOP_GITHUB_ACCEPT,
    'X-GitHub-Api-Version': DESKTOP_GITHUB_API_VERSION,
  }
  if (channel !== undefined) headers[DESKTOP_RELEASE_CHANNEL_HEADER] = channel
  if (currentVersion !== undefined) {
    const parsed = channel === undefined
      ? parseCanonicalChannelVersion(currentVersion, 'stable')
      : parseCanonicalSupportedVersion(currentVersion)
    if (parsed === null) {
      throw new Error(channel === undefined
        ? 'Desktop current version must be canonical stable SemVer.'
        : 'Desktop current version must be canonical SemVer.')
    }
    headers[DESKTOP_CURRENT_VERSION_HEADER] = parsed.version
  }
  if (installationId !== undefined) {
    headers[DESKTOP_INSTALLATION_ID_HEADER] = assertDesktopInstallationId(installationId)
  }
  return headers
}

async function defaultRequest(url: string, init: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init)
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null
    && /^[0-9]+$/u.test(declaredLength)
    && BigInt(declaredLength) > BigInt(MAX_VERSION_RESPONSE_BYTES)) {
    throw new Error('version response is too large')
  }

  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytesRead = 0
  let body = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytesRead += chunk.value.byteLength
      if (bytesRead > MAX_VERSION_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('version response is too large')
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    return body + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse the GitHub releases-list payload into Desktop-relevant entries.
 * Draft releases are skipped; the API's newest-first ordering is preserved.
 * @param payload - parsed JSON body of the releases endpoint.
 * @returns releases with canonical SemVer tags and Desktop installer assets.
 */
export function parseDesktopReleasesList(payload: unknown): readonly DesktopRelease[] {
  if (!Array.isArray(payload)) return []
  const releases: DesktopRelease[] = []
  for (const entry of payload) {
    if (!isRecord(entry)) continue
    if (entry.draft === true) continue
    const parsed = parseSemVer(typeof entry.tag_name === 'string' ? entry.tag_name : '')
    if (parsed === null) continue
    const releaseUrl = typeof entry.html_url === 'string' && entry.html_url.startsWith('https://')
      ? entry.html_url
      : undefined
    releases.push({
      version: parsed.version,
      parsed,
      draft: false,
      prerelease: entry.prerelease === true,
      ...(releaseUrl === undefined ? {} : { releaseUrl }),
      assets: parseReleaseAssets(entry.assets),
    })
  }
  return releases
}

function parseReleaseAssets(value: unknown): DesktopInstallerAssets {
  if (!Array.isArray(value)) return {}
  const assets: { win32?: DesktopReleaseAsset; darwin?: DesktopReleaseAsset } = {}
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const name = typeof raw.name === 'string' ? raw.name : ''
    const url = typeof raw.browser_download_url === 'string' ? raw.browser_download_url : ''
    if (name === '' || !url.startsWith('https://')) continue
    if (name.endsWith('.blockmap') || name.endsWith('.yml')) continue
    const size = typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size > 0 ? raw.size : undefined
    const rawDigest = typeof raw.digest === 'string' && raw.digest.startsWith('sha256:')
      ? raw.digest.slice('sha256:'.length).trim().toLowerCase()
      : undefined
    const digest = rawDigest !== undefined && /^[0-9a-f]{64}$/u.test(rawDigest) ? rawDigest : undefined
    const asset: DesktopReleaseAsset = {
      name,
      url,
      ...(size === undefined ? {} : { size }),
      ...(digest === undefined ? {} : { sha256: digest }),
    }
    if (name.endsWith('.exe') && assets.win32 === undefined) assets.win32 = asset
    if (name.endsWith('.dmg') && assets.darwin === undefined) assets.darwin = asset
  }
  return assets
}

/**
 * Newest release whose tag is canonical SemVer for the channel.
 * The API returns newest-first, so the first match wins. Stable keeps its
 * documented promotion of Next installers.
 * @param releases - parsed releases in API order.
 * @param channel - release stream to select.
 * @returns the selected release, or null when none matches.
 */
export function pickDesktopReleaseForChannel(
  releases: readonly DesktopRelease[],
  channel: DesktopReleaseChannel,
): DesktopRelease | null {
  for (const release of releases) {
    if (parseCanonicalUpdateVersion(release.version, channel) !== null) return release
  }
  return null
}

/** Digests of the platform installers on one release, when GitHub publishes them. */
export function releaseInstallerDigests(
  assets: DesktopInstallerAssets,
): UpdateCheckResult['installerSha256'] | undefined {
  const digests: Partial<Record<'win32' | 'darwin', string>> = {}
  if (assets.win32?.sha256 !== undefined) digests.win32 = assets.win32.sha256
  if (assets.darwin?.sha256 !== undefined) digests.darwin = assets.darwin.sha256
  return Object.keys(digests).length > 0 ? digests : undefined
}

/** Stable may promote a Next installer while keeping the stable service stream authoritative. */
export function parseCanonicalUpdateVersion(input: string, channel: DesktopReleaseChannel): ParsedSemVer | null {
  return parseCanonicalChannelVersion(input, channel)
    ?? (channel === 'stable' ? parseCanonicalChannelVersion(input, 'next') : null)
}

export function parseCanonicalChannelVersion(
  input: string,
  channel: DesktopReleaseChannel,
): ParsedSemVer | null {
  const parsed = parseCanonicalVersion(input)
  if (parsed === null) return null
  if (channel === 'stable') return parsed.prerelease.length === 0 ? parsed : null
  if (channel === 'next' && parsed.prerelease.length === 1 && parsed.prerelease[0] === 'next') return parsed
  return parsed.prerelease.length === 2
    && parsed.prerelease[0] === channel
    && isNumeric(parsed.prerelease[1]!)
    ? parsed
    : null
}

function parseCanonicalSupportedVersion(input: string): ParsedSemVer | null {
  return parseCanonicalChannelVersion(input, 'stable')
    ?? parseCanonicalChannelVersion(input, 'beta')
    ?? parseCanonicalChannelVersion(input, 'next')
}

function parseCanonicalVersion(input: string): ParsedSemVer | null {
  const parsed = parseSemVer(input)
  return parsed !== null && parsed.version === input ? parsed : null
}

function compareParsedSemVer(left: ParsedSemVer, right: ParsedSemVer): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    const comparison = compareNumeric(left[key], right[key])
    if (comparison !== 0) return comparison
  }
  if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1
  if (right.prerelease.length === 0) return -1

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue

    const leftNumeric = isNumeric(leftIdentifier)
    const rightNumeric = isNumeric(rightIdentifier)
    if (leftNumeric && rightNumeric) return compareNumeric(leftIdentifier, rightIdentifier)
    if (leftNumeric) return -1
    if (rightNumeric) return 1
    return leftIdentifier < rightIdentifier ? -1 : 1
  }
  return 0
}

function compareNumeric(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

function isNumeric(identifier: string): boolean {
  return /^[0-9]+$/u.test(identifier)
}

function hasLeadingZero(identifier: string): boolean {
  return identifier.length > 1 && identifier.startsWith('0')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
