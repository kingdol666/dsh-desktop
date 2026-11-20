import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopChannelHome,
  desktopSharedHomeNoticeRequired,
  migrateLegacyChannelHome,
  resolveDesktopChannelHome,
} from '../src/desktop-channel-home.ts'
import { DESKTOP_RELEASE_IDENTITIES } from '../src/product-identity.ts'

const stable = DESKTOP_RELEASE_IDENTITIES.stable
const beta = DESKTOP_RELEASE_IDENTITIES.beta
const userHome = process.platform === 'win32' ? 'C:\Users\tester' : '/home/tester'
const stableHome = resolve(join(userHome, '.pmstudio'))
/** Pre-rename Stable home; now only a migration source and Beta's shared home. */
const legacyShared = resolve(join(userHome, '.dsh'))
const betaHome = resolve(join(userHome, '.dsh-beta'))
const inUse = (...paths: string[]) => (path: string) => paths.includes(path)
const none = () => false

describe('desktopChannelHome', () => {
  it('gives each release channel a distinct product-owned home', () => {
    expect(desktopChannelHome(stable, userHome)).toBe(stableHome)
    expect(desktopChannelHome(beta, userHome)).toBe(betaHome)
  })
})

describe('resolveDesktopChannelHome', () => {
  it('keeps Stable on the product home it already owns', () => {
    const resolution = resolveDesktopChannelHome({
      identity: stable,
      environment: {},
      homeDirectory: userHome,
      homeInUse: inUse(stableHome),
    })
    expect(resolution.homeDir).toBe(stableHome)
    expect(resolution.status).toBe('channel')
    expect(desktopSharedHomeNoticeRequired(resolution, 'default')).toBe(false)
  })

  it('sends a fresh Beta install straight to its own home', () => {
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: {},
      homeDirectory: userHome,
      homeInUse: none,
    })
    expect(resolution.homeDir).toBe(betaHome)
    expect(resolution.status).toBe('channel')
    expect(desktopSharedHomeNoticeRequired(resolution, 'default')).toBe(false)
  })

  it('leaves an installed Beta on the shared home and asks for the notice', () => {
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: {},
      homeDirectory: userHome,
      homeInUse: inUse(stableHome),
    })
    expect(resolution.homeDir).toBe(stableHome)
    expect(resolution.channelHome).toBe(betaHome)
    expect(resolution.status).toBe('legacy-shared')
    expect(desktopSharedHomeNoticeRequired(resolution, 'default')).toBe(true)
  })

  it('prefers the channel home once it holds data, even beside the shared home', () => {
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: {},
      homeDirectory: userHome,
      homeInUse: inUse(stableHome, betaHome),
    })
    expect(resolution.homeDir).toBe(betaHome)
    expect(resolution.status).toBe('channel')
  })

  it('never overrides an explicit DSH_HOME', () => {
    const configured = resolve(join(userHome, 'elsewhere'))
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: { DSH_HOME: configured },
      homeDirectory: userHome,
      homeInUse: inUse(stableHome),
    })
    expect(resolution.homeDir).toBe(configured)
    expect(resolution.status).toBe('explicit')
    expect(desktopSharedHomeNoticeRequired(resolution, 'environment')).toBe(false)
  })

  it('ignores a blank DSH_HOME', () => {
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: { DSH_HOME: '   ' },
      homeDirectory: userHome,
      homeInUse: inUse(stableHome),
    })
    expect(resolution.status).toBe('legacy-shared')
  })
})

describe('legacy home migration', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('copies the pre-rename home once and records the source', () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-home-migrate-'))
    roots.push(root)
    const legacy = join(root, '.dsh')
    const channel = join(root, '.pmstudio')
    mkdirSync(join(legacy, 'sessions'), { recursive: true })
    writeFileSync(join(legacy, 'sessions', 's1.jsonl'), '{"id":"s1"}\n')
    writeFileSync(join(legacy, '.credentials.yaml'), 'refs: {}\n')

    expect(migrateLegacyChannelHome(channel, legacy)).toBe(true)
    expect(readFileSync(join(channel, 'sessions', 's1.jsonl'), 'utf8')).toContain('s1')
    expect(existsSync(join(channel, '.migrated-from-legacy-home'))).toBe(true)

    // A second launch must not copy again.
    writeFileSync(join(channel, 'sessions', 's1.jsonl'), '{"id":"s1-updated"}\n')
    expect(migrateLegacyChannelHome(channel, legacy)).toBe(false)
    expect(readFileSync(join(channel, 'sessions', 's1.jsonl'), 'utf8')).toContain('s1-updated')
  })

  it('adopts the pre-rename home when the product home is still empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-home-adopt-'))
    roots.push(root)
    const legacy = join(root, '.dsh')
    mkdirSync(join(legacy, 'profiles', 'desktop'), { recursive: true })
    writeFileSync(join(legacy, 'profiles', 'desktop', 'package.json'), '{"name":"dsh-profile-desktop"}\n')

    const resolution = resolveDesktopChannelHome({
      identity: stable,
      environment: {},
      homeDirectory: root,
      homeInUse: path => existsSync(join(path, 'profiles', 'desktop', 'package.json')),
    })
    expect(resolution.status).toBe('channel')
    expect(resolution.homeDir).toBe(join(root, '.pmstudio'))
    expect(existsSync(join(root, '.pmstudio', 'profiles', 'desktop', 'package.json'))).toBe(true)
  })
})

describe('desktopSharedHomeNoticeRequired', () => {
  it('stays silent once the user has chosen a directory in Recovery', () => {
    const resolution = resolveDesktopChannelHome({
      identity: beta,
      environment: {},
      homeDirectory: userHome,
      homeInUse: inUse(stableHome),
    })
    expect(resolution.status).toBe('legacy-shared')
    expect(desktopSharedHomeNoticeRequired(resolution, 'desktop')).toBe(false)
  })
})
