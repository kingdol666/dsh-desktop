/** Desktop-shipped research bundles: syncDesktopManagedProfileBundles injects
 * the partitioned knowledge base, literature library and cognition memory into
 * every desktop profile's bundle list, idempotently, without touching unrelated
 * entries or the dependency fields. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DESKTOP_SHIPPED_PLUGIN_BUNDLES, desktopBundleList, syncDesktopManagedProfileBundles } from '../src/profile.ts'

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
  it('declares the literature and research plugins as shipped bundles', () => {
    expect(DESKTOP_SHIPPED_PLUGIN_BUNDLES).toEqual([
      'dsh-zotero-skill',
      'dsh-zotero-local',
      'dsh-kb-rag',
      'dsh-cognition-engine',
      'dsh-lit-library',
      'dsh-lit-harvest',
      'dsh-cite-verify',
      '@perrylink/dsh-research-core',
      'dsh-agent-skill',
      '@bushizhanghan/dsh-context-budget',
      'dsh-domain-router',
      'dsh-doc-router',
      'dsh-python-env',
      'dsh-second-opinion',
      'dsh-progress-nudge',
      'dsh-preview-stl',
    ])
  })

  it('injects the shipped bundles into a fresh template profile', () => {
    const dir = profileWith(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    syncDesktopManagedProfileBundles(dir, { market: 'community-market', aaEnabled: false })
    const bundles = bundlesOf(dir)
    expect(bundles).toContain('dsh-zotero-skill')
    expect(bundles).toContain('dsh-kb-rag')
    expect(bundles).toContain('dsh-cognition-engine')
    expect(bundles).toContain('dsh-lit-library')
    expect(bundles).toContain('dsh-cite-verify')
    expect(bundles).toContain('dsh-agent-skill')
    expect(bundles).toContain('@bushizhanghan/dsh-context-budget')
    expect(bundles).toContain('dsh-domain-router')
    expect(bundles).toContain('dsh-zotero-local')
    expect(bundles).toContain('dsh-lit-harvest')
    expect(bundles).toContain('dsh-doc-router')
    expect(bundles).toContain('dsh-python-env')
    expect(bundles).toContain('dsh-second-opinion')
    expect(bundles).toContain('dsh-progress-nudge')
    expect(bundles).toContain('dsh-preview-stl')
    expect(bundles).toContain('@deepseek-ai/dsh-base')
  })

  it('is idempotent and preserves an existing higher-precedence copy', () => {
    const dir = profileWith([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-market',
      'dsh-zotero-skill',
      'dsh-cognition-engine',
    ])
    syncDesktopManagedProfileBundles(dir, { market: 'community-market', aaEnabled: false })
    const bundles = bundlesOf(dir)
    expect(bundles.slice(0, 5)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-market',
      'dsh-zotero-skill',
      'dsh-cognition-engine',
    ])
    expect(bundles).toContain('dsh-kb-rag')
    expect(bundles).toContain('dsh-lit-library')
  })

  it('retires bundles replaced by the paper-centric research stack', () => {
    const dir = profileWith([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-knowledge-base',
      'dsh-matlab-workbench',
      'memory-eternal',
      'dsh-library',
      'dsh-research-skills',
      'dsh-zotero-skill',
    ])
    syncDesktopManagedProfileBundles(dir, { market: 'disabled', aaEnabled: false })
    const bundles = bundlesOf(dir)
    for (const retired of ['dsh-knowledge-base', 'dsh-matlab-workbench', 'memory-eternal', 'dsh-library', 'dsh-research-skills']) {
      expect(bundles).not.toContain(retired)
    }
    expect(bundles).toContain('dsh-zotero-skill')
    expect(bundles).toContain('dsh-kb-rag')
    expect(bundles).toContain('dsh-cognition-engine')
    expect(bundles).toContain('dsh-lit-library')
  })

  it('prunes retired bundles during profile preparation', () => {
    const bundles = desktopBundleList([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-knowledge-base',
      'dsh-matlab-workbench',
      'dsh-zotero-skill',
      'memory-eternal',
      'dsh-cognition-engine',
    ])
    expect(bundles).not.toContain('dsh-knowledge-base')
    expect(bundles).not.toContain('dsh-matlab-workbench')
    expect(bundles).not.toContain('memory-eternal')
    expect(bundles).toContain('dsh-zotero-skill')
    expect(bundles).toContain('dsh-cognition-engine')
  })

  it('leaves dependency fields untouched', () => {
    const dir = profileWith(['@deepseek-ai/dsh-base'])
    syncDesktopManagedProfileBundles(dir, { market: 'disabled', aaEnabled: false })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.dependencies).toEqual({})
  })
})
