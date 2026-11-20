/** Desktop-shipped literature bundles: syncDesktopManagedProfileBundles injects
 * dsh-kb-rag / dsh-zotero-skill into every desktop profile's bundle list,
 * idempotently, without touching unrelated entries or the dependency fields. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DESKTOP_SHIPPED_PLUGIN_BUNDLES, syncDesktopManagedProfileBundles } from '../src/profile.ts'

const homes: string[] = []

function profileWith(bundles: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-shipped-bundles-'))
  homes.push(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-test',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles } },
  }))
  return dir
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function bundlesOf(dir: string): string[] {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh.profile.bundles
}

describe('desktop shipped plugin bundles', () => {
  it('declares the literature plugins as shipped bundles', () => {
    expect(DESKTOP_SHIPPED_PLUGIN_BUNDLES).toEqual(['dsh-kb-rag', 'dsh-zotero-skill'])
  })

  it('injects the shipped bundles into a fresh template profile', () => {
    const dir = profileWith(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    syncDesktopManagedProfileBundles(dir, { market: 'community-market', aaEnabled: false })
    const bundles = bundlesOf(dir)
    expect(bundles).toContain('dsh-kb-rag')
    expect(bundles).toContain('dsh-zotero-skill')
    expect(bundles).toContain('@deepseek-ai/dsh-base')
  })

  it('is idempotent and preserves an existing higher-precedence copy', () => {
    const dir = profileWith([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-market',
      'dsh-kb-rag',
      'dsh-zotero-skill',
    ])
    syncDesktopManagedProfileBundles(dir, { market: 'community-market', aaEnabled: false })
    expect(bundlesOf(dir)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-market',
      'dsh-kb-rag',
      'dsh-zotero-skill',
    ])
  })

  it('leaves dependency fields untouched', () => {
    const dir = profileWith(['@deepseek-ai/dsh-base'])
    syncDesktopManagedProfileBundles(dir, { market: 'disabled', aaEnabled: false })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.dependencies).toEqual({})
  })
})
