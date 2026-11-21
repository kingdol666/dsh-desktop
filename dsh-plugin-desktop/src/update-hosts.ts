/** Host validation shared by GitHub update checks and installer downloads. */

/** GitHub REST API host that serves the public releases list. */
export const GITHUB_API_HOST = 'api.github.com'

/** GitHub web host that serves release pages and asset download URLs. */
export const GITHUB_WEB_HOST = 'github.com'

/** HTTPS CDN suffix GitHub redirects release-asset downloads to. */
const GITHUB_ASSET_HOST_SUFFIX = '.githubusercontent.com'

/** DNS suffixes that resolve to the local machine or a private network. */
const LOCAL_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'] as const

/**
 * Parse a URL that is safe for an outbound update request: HTTPS, no embedded
 * credentials, the default HTTPS port, and a public host (never localhost,
 * loopback, private, reserved, multicast, or unspecified addresses).
 * @param value - candidate absolute URL.
 * @returns the parsed URL, or null when any safety check fails.
 */
export function parsePublicHttpsUrl(value: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username !== '' || parsed.password !== '') return null
  if (parsed.port !== '' && parsed.port !== '443') return null
  // A trailing dot is a valid FQDN form (`localhost.`); normalize it before
  // the local-name checks so it cannot bypass them.
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, '')
  if (host === '') return null
  if (host === 'localhost' || LOCAL_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))) return null
  const address = stripIpv6Brackets(host)
  if (address.includes(':')) {
    return isPublicIpv6(address) ? parsed : null
  }
  if (/^[0-9]+(?:\.[0-9]+){3}$/u.test(address)) {
    return isPublicIpv4(address) ? parsed : null
  }
  return parsed
}

/** Whether a host is GitHub's fixed public API host. */
export function isGitHubApiHost(host: string): boolean {
  return host.toLowerCase() === GITHUB_API_HOST
}

/** Whether a host is GitHub's web host or a release-asset CDN host. */
export function isGitHubAssetHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return normalized === GITHUB_WEB_HOST || normalized.endsWith(GITHUB_ASSET_HOST_SUFFIX)
}

function stripIpv6Brackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function isPublicIpv4(host: string): boolean {
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b, c] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false
  return true
}

function isPublicIpv6(host: string): boolean {
  const normalized = host.toLowerCase()
  if (normalized === '::' || normalized === '::1') return false
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')
    || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return false
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false
  if (normalized.startsWith('ff')) return false
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    return mapped.includes('.') ? isPublicIpv4(mapped) : false
  }
  return true
}
