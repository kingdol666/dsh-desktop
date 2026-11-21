import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_CURRENT_VERSION_HEADER,
  DESKTOP_GITHUB_ACCEPT,
  DESKTOP_GITHUB_API_VERSION,
  DESKTOP_GITHUB_OWNER,
  DESKTOP_GITHUB_REPO,
  DESKTOP_RELEASE_CHANNEL_HEADER,
  DESKTOP_VERSION_ENDPOINT,
  MAX_VERSION_RESPONSE_BYTES,
  checkForStableUpdate,
  checkForDesktopUpdate,
  compareSemVerVersions,
  desktopVersionRequestHeaders,
  parseDesktopReleasesList,
  pickDesktopReleaseForChannel,
  parseSemVer,
  type UpdateRequest,
} from '../src/update-checker.ts'
import {
  assertDesktopInstallationId,
  DESKTOP_INSTALLATION_ID_HEADER,
} from '../src/desktop-installation-id.ts'

const INSTALLATION_ID = assertDesktopInstallationId('01234567-89ab-4cde-8f01-23456789abcd')
const RELEASE_PAGE = 'https://github.com/kingdol666/polymechanism-studio/releases/tag'

function assetUrl(tag: string, name: string): string {
  return `https://github.com/${DESKTOP_GITHUB_OWNER}/${DESKTOP_GITHUB_REPO}/releases/download/${tag}/${name}`
}

function assetEntry(name: string, tag: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, browser_download_url: assetUrl(tag, name), size: 1024, ...extra }
}

function releaseEntry(tag: string, extra: {
  prerelease?: boolean
  draft?: boolean
  htmlUrl?: string
  assets?: Array<Record<string, unknown>>
} = {}): Record<string, unknown> {
  return {
    tag_name: tag,
    draft: extra.draft ?? false,
    prerelease: extra.prerelease ?? false,
    html_url: extra.htmlUrl ?? `${RELEASE_PAGE}/${tag}`,
    assets: extra.assets ?? [],
  }
}

function releasesResponse(entries: Array<Record<string, unknown>>, init: ResponseInit = {}): Response {
  return Response.json(entries, init)
}

describe('strict SemVer parsing', () => {
  it('accepts a three-part version, optional lowercase v, prerelease, and build metadata', () => {
    expect(parseSemVer('v2.10.3-alpha.1+mac.arm64')).toEqual({
      version: '2.10.3-alpha.1+mac.arm64',
      major: '2',
      minor: '10',
      patch: '3',
      prerelease: ['alpha', '1'],
      build: ['mac', 'arm64'],
    })
    expect(parseSemVer('0.0.0')).not.toBeNull()
  })

  it.each([
    '1',
    '1.2',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-01',
    '1.2.3-alpha..1',
    '1.2.3+',
    'V1.2.3',
    ' 1.2.3',
  ])('rejects invalid SemVer %s', version => {
    expect(parseSemVer(version)).toBeNull()
  })

  it('compares strict versions without numeric overflow', () => {
    expect(compareSemVerVersions('2.1.0', '2.0.9')).toBeGreaterThan(0)
    expect(compareSemVerVersions('2.0.0-rc.1', '2.0.0')).toBeLessThan(0)
    expect(compareSemVerVersions('2.0', '2.0.0')).toBeNull()
    expect(compareSemVerVersions(
      '10000000000000000.0.0',
      '9007199254740992.0.0',
    )).toBeGreaterThan(0)
  })
})

describe('GitHub releases-list parsing', () => {
  it('keeps newest-first order, drops drafts and unparsable tags, and resolves Desktop assets', () => {
    const releases = parseDesktopReleasesList([
      releaseEntry('v2.3.0', {
        assets: [
          assetEntry('PolyMechanism-Studio-2.3.0-x64-Setup.exe', 'v2.3.0', { digest: `sha256:${'A'.repeat(64)}` }),
          assetEntry('PolyMechanism-Studio-2.3.0-x64-Setup.exe.blockmap', 'v2.3.0'),
          assetEntry('latest.yml', 'v2.3.0'),
        ],
      }),
      releaseEntry('not-a-version'),
      releaseEntry('v2.2.0', { draft: true }),
      releaseEntry('v2.1.0', {
        assets: [
          assetEntry('PolyMechanism-Studio-2.1.0-mac.dmg', 'v2.1.0'),
          assetEntry('PolyMechanism-Studio-2.1.0-x64-Setup.exe', 'v2.1.0'),
        ],
      }),
    ])
    expect(releases.map(release => release.version)).toEqual(['2.3.0', '2.1.0'])
    expect(releases[0]?.releaseUrl).toBe(`${RELEASE_PAGE}/v2.3.0`)
    expect(releases[0]?.assets.win32?.name).toBe('PolyMechanism-Studio-2.3.0-x64-Setup.exe')
    expect(releases[0]?.assets.win32?.sha256).toBe('a'.repeat(64))
    expect(releases[0]?.assets.darwin).toBeUndefined()
    expect(releases[1]?.assets.darwin?.name).toBe('PolyMechanism-Studio-2.1.0-mac.dmg')
    expect(releases[1]?.assets.win32?.name).toBe('PolyMechanism-Studio-2.1.0-x64-Setup.exe')
  })

  it('ignores non-array payloads and malformed entries without failing', () => {
    expect(parseDesktopReleasesList(null)).toEqual([])
    expect(parseDesktopReleasesList({ tag_name: 'v2.1.0' })).toEqual([])
    expect(parseDesktopReleasesList([
      42,
      null,
      { tag_name: 2 },
      { tag_name: 'v2.1.0', html_url: 'http://insecure.example/tag', assets: 'no' },
    ]).map(release => release.version)).toEqual(['2.1.0'])
    expect(parseDesktopReleasesList([{ tag_name: 'v2.1.0', assets: [{ name: 'x.exe' }] }])[0]?.assets.win32).toBeUndefined()
  })

  it.each([
    ['stable', ['v2.2.0-beta.1', 'v2.1.0'], '2.1.0'],
    ['beta', ['v2.2.0', 'v2.2.0-beta.2', 'v2.2.0-beta.1'], '2.2.0-beta.2'],
    ['next', ['v2.2.0', 'v2.2.0-next.3', 'v2.2.0-next'], '2.2.0-next.3'],
  ] as const)('picks the newest %s release from API order', (channel, tags, expected) => {
    const releases = parseDesktopReleasesList(tags.map(tag => releaseEntry(tag)))
    expect(pickDesktopReleaseForChannel(releases, channel)?.version).toBe(expected)
  })

  it('answers Stable through its documented Next promotion, but never beta', () => {
    const nextOnly = parseDesktopReleasesList([releaseEntry('v2.2.0-next.1')])
    expect(pickDesktopReleaseForChannel(nextOnly, 'stable')?.version).toBe('2.2.0-next.1')
    expect(pickDesktopReleaseForChannel(nextOnly, 'beta')).toBeNull()
    expect(pickDesktopReleaseForChannel(parseDesktopReleasesList([releaseEntry('v2.2.0')]), 'next')).toBeNull()
  })
})

describe('GitHub Desktop version check', () => {
  it('uses only the GitHub releases endpoint and reports a newer stable version', async () => {
    const controller = new AbortController()
    const calls: Array<{ url: string, init: RequestInit }> = []
    const request: UpdateRequest = async (url, init) => {
      calls.push({ url, init })
      return releasesResponse([releaseEntry('v2.10.0')])
    }

    await expect(checkForStableUpdate({
      currentVersion: '2.9.9',
      installationId: INSTALLATION_ID,
      signal: controller.signal,
      request,
    })).resolves.toMatchObject({
      status: 'update-available',
      currentVersion: '2.9.9',
      latestVersion: '2.10.0',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(DESKTOP_VERSION_ENDPOINT)
    expect(calls[0]?.url).toContain(`/repos/${DESKTOP_GITHUB_OWNER}/${DESKTOP_GITHUB_REPO}/releases`)
    expect(calls[0]?.init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('accept')).toBe(DESKTOP_GITHUB_ACCEPT)
    expect(headers.get('x-github-api-version')).toBe(DESKTOP_GITHUB_API_VERSION)
    expect(headers.get(DESKTOP_RELEASE_CHANNEL_HEADER)).toBe('stable')
    expect(headers.get(DESKTOP_CURRENT_VERSION_HEADER)).toBe('2.9.9')
    expect(headers.get(DESKTOP_INSTALLATION_ID_HEADER)).toBe(INSTALLATION_ID)
    expect(headers.has('if-none-match')).toBe(false)
  })

  it('surfaces the release page and per-platform installer assets of the selected release', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.1.0',
      request: async () => releasesResponse([
        releaseEntry('v2.2.0', {
          assets: [
            assetEntry('PolyMechanism-Studio-2.2.0-x64-Setup.exe', 'v2.2.0'),
            assetEntry('PolyMechanism-Studio-2.2.0-mac.dmg', 'v2.2.0'),
          ],
        }),
      ]),
    })).resolves.toEqual({
      status: 'update-available',
      currentVersion: '2.1.0',
      latestVersion: '2.2.0',
      releaseUrl: `${RELEASE_PAGE}/v2.2.0`,
      installerAssets: {
        win32: {
          name: 'PolyMechanism-Studio-2.2.0-x64-Setup.exe',
          url: assetUrl('v2.2.0', 'PolyMechanism-Studio-2.2.0-x64-Setup.exe'),
          size: 1024,
        },
        darwin: {
          name: 'PolyMechanism-Studio-2.2.0-mac.dmg',
          url: assetUrl('v2.2.0', 'PolyMechanism-Studio-2.2.0-mac.dmg'),
          size: 1024,
        },
      },
    })
  })

  it('reports no update when the newest stable release equals or predates the installed version', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.2.0',
      request: async () => releasesResponse([releaseEntry('v2.2.0')]),
    })).resolves.toMatchObject({ status: 'up-to-date', latestVersion: '2.2.0' })
    await expect(checkForStableUpdate({
      currentVersion: '2.2.1',
      request: async () => releasesResponse([releaseEntry('v2.2.0')]),
    })).resolves.toMatchObject({ status: 'up-to-date', latestVersion: '2.2.0' })
    await expect(checkForStableUpdate({
      currentVersion: '2.2.0+installed',
      request: async () => releasesResponse([releaseEntry('v2.2.0+release')]),
    })).resolves.toMatchObject({ status: 'up-to-date', currentVersion: '2.2.0+installed' })
  })

  it('builds a bounded version-check header set and rejects malformed identities', () => {
    expect(desktopVersionRequestHeaders(INSTALLATION_ID)).toEqual({
      Accept: DESKTOP_GITHUB_ACCEPT,
      'X-GitHub-Api-Version': DESKTOP_GITHUB_API_VERSION,
      [DESKTOP_INSTALLATION_ID_HEADER]: INSTALLATION_ID,
    })
    expect(desktopVersionRequestHeaders(INSTALLATION_ID, '2.9.9')).toEqual({
      Accept: DESKTOP_GITHUB_ACCEPT,
      'X-GitHub-Api-Version': DESKTOP_GITHUB_API_VERSION,
      [DESKTOP_CURRENT_VERSION_HEADER]: '2.9.9',
      [DESKTOP_INSTALLATION_ID_HEADER]: INSTALLATION_ID,
    })
    expect(desktopVersionRequestHeaders()).toEqual({
      Accept: DESKTOP_GITHUB_ACCEPT,
      'X-GitHub-Api-Version': DESKTOP_GITHUB_API_VERSION,
    })
    expect(() => desktopVersionRequestHeaders(undefined, '2.9.0-rc.1')).toThrow('canonical stable SemVer')
    expect(() => desktopVersionRequestHeaders('not-a-uuid')).toThrow('canonical lowercase UUID v4')
  })

  it('skips the endpoint when an invalid installation identity reaches the checker', async () => {
    const request = vi.fn(async () => releasesResponse([releaseEntry('v2.1.0')]))
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      installationId: 'not-a-uuid' as never,
      request,
    })).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('surfaces per-platform asset digests with case normalization', async () => {
    const upper = 'A'.repeat(64)
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => releasesResponse([releaseEntry('v2.1.0', {
        assets: [
          assetEntry('PolyMechanism-Studio-2.1.0-x64-Setup.exe', 'v2.1.0', { digest: `sha256:${upper}` }),
          assetEntry('PolyMechanism-Studio-2.1.0-mac.dmg', 'v2.1.0', { digest: `sha256:${'B'.repeat(64)}` }),
        ],
      })]),
    })).resolves.toMatchObject({
      installerSha256: { win32: 'a'.repeat(64), darwin: 'b'.repeat(64) },
    })
  })

  it('ignores malformed asset digest fields without failing the check', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => releasesResponse([releaseEntry('v2.1.0', {
        assets: [assetEntry('PolyMechanism-Studio-2.1.0-x64-Setup.exe', 'v2.1.0', { digest: 'not-hex' })],
      })]),
    })).resolves.toMatchObject({ status: 'update-available', latestVersion: '2.1.0' })
  })

  it('compares service versions without overflowing JavaScript numbers', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '9007199254740992.0.0',
      request: async () => releasesResponse([releaseEntry('v10000000000000000.0.0')]),
    })).resolves.toMatchObject({ status: 'update-available' })
  })

  it.each([
    ['draft release', [releaseEntry('v2.1.0', { draft: true })]],
    ['prerelease-only list', [releaseEntry('v2.1.0-rc.1', { prerelease: true })]],
    ['invalid tag', [releaseEntry('v2.01.0')]],
    ['missing tag', [{}]],
    ['non-string tag', [{ tag_name: 2 }]],
    ['non-array payload', []],
  ])('silently ignores a releases list with %s', async (_label, entries) => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => Response.json(entries as unknown),
    })).resolves.toBeNull()
  })

  it('silently ignores malformed JSON and non-200 statuses', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => new Response('{'),
    })).resolves.toBeNull()
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => new Response('unavailable', { status: 503 }),
    })).resolves.toBeNull()
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => new Response(null, { status: 304 }),
    })).resolves.toBeNull()
  })

  it('silently ignores network failure and caller cancellation', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => { throw new TypeError('offline') },
    })).resolves.toBeNull()

    const controller = new AbortController()
    controller.abort()
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      signal: controller.signal,
      request: async () => { throw new DOMException('cancelled', 'AbortError') },
    })).resolves.toBeNull()
  })

  it('silently ignores declared and streamed oversized responses', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => new Response('{}', {
        headers: { 'content-length': String(MAX_VERSION_RESPONSE_BYTES + 1) },
      }),
    })).resolves.toBeNull()
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      request: async () => new Response('x'.repeat(MAX_VERSION_RESPONSE_BYTES + 1)),
    })).resolves.toBeNull()
  })

  it.each(['2.0', 'v2.0.0', '2.0.0-rc.1'])('skips invalid installed version %s before requesting', async currentVersion => {
    const request = vi.fn(async () => releasesResponse([releaseEntry('v2.1.0')]))

    await expect(checkForStableUpdate({ currentVersion, request })).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts the ID-based API redirect a renamed repository answers with', async () => {
    const response = releasesResponse([releaseEntry('v2.10.0')])
    Object.defineProperty(response, 'url', {
      value: 'https://api.github.com/repositories/123456789/releases?per_page=15',
    })

    await expect(checkForStableUpdate({
      currentVersion: '2.9.9',
      request: async () => response,
    })).resolves.toMatchObject({ status: 'update-available', latestVersion: '2.10.0' })
  })

  it.each([
    ['an off-GitHub host', 'https://evil.example/repositories/123456789/releases'],
    ['an insecure API URL', 'http://api.github.com/repositories/123456789/releases'],
    ['a private address', 'https://127.0.0.1/repositories/123456789/releases'],
  ])('rejects a version response that settles on %s', async (_label, url) => {
    const response = releasesResponse([releaseEntry('v2.10.0')])
    Object.defineProperty(response, 'url', { value: url })

    await expect(checkForStableUpdate({
      currentVersion: '2.9.9',
      request: async () => response,
    })).resolves.toBeNull()
  })
})

describe('channel isolation on GitHub releases', () => {
  it('lets Stable promote a Next-tagged release while keeping precedence authoritative', async () => {
    await expect(checkForStableUpdate({
      currentVersion: '2.0.19',
      request: async () => releasesResponse([releaseEntry('v2.0.20-next')]),
    })).resolves.toMatchObject({ status: 'update-available', latestVersion: '2.0.20-next' })
    await expect(checkForStableUpdate({
      currentVersion: '2.0.20',
      request: async () => releasesResponse([releaseEntry('v2.0.20-next')]),
    })).resolves.toMatchObject({ status: 'up-to-date', latestVersion: '2.0.20-next' })
  })

  it('keeps beta and next selections isolated from stable', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '2.0.14-next',
      channel: 'next',
      request: async () => releasesResponse([releaseEntry('v2.0.18-next.1')]),
    })).resolves.toMatchObject({ status: 'update-available', latestVersion: '2.0.18-next.1' })
    await expect(checkForDesktopUpdate({
      currentVersion: '2.0.19',
      channel: 'next',
      request: async () => releasesResponse([releaseEntry('v2.0.18')]),
    })).resolves.toBeNull()
    await expect(checkForDesktopUpdate({
      currentVersion: '2.0.14-beta.1',
      channel: 'beta',
      request: async () => releasesResponse([releaseEntry('v2.0.18-beta.1')]),
    })).resolves.toMatchObject({ status: 'update-available', latestVersion: '2.0.18-beta.1' })
    await expect(checkForDesktopUpdate({
      currentVersion: '2.0.19',
      channel: 'stable',
      request: async () => releasesResponse([releaseEntry('v2.0.20-beta.1', { prerelease: true })]),
    })).resolves.toBeNull()
  })

  it('preserves the installed version header for Next installations', async () => {
    const request = vi.fn<UpdateRequest>(async () => releasesResponse([releaseEntry('v2.0.18-next.1')]))
    await checkForDesktopUpdate({ currentVersion: '2.0.14-next', channel: 'next', request })
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get(DESKTOP_CURRENT_VERSION_HEADER)).toBe('2.0.14-next')
  })
})
