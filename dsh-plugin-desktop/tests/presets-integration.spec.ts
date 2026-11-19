import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DESKTOP_PATCH = readFileSync(`${REPO_ROOT}dsh-plugin-desktop/cordis.patch.yml`, 'utf8')

/** The six prebuilt polymer experts every desktop profile must expose. */
export const PM_PRESET_IDS = [
  'polymer-scientist',
  'polymer-physicist',
  'polymer-characterization',
  'polymer-modeler',
  'polymer-literature',
  'polymer-reviewer',
] as const

describe('prebuilt expert presets composition', () => {
  it('inserts one agent-preset row per polymer expert', () => {
    for (const presetId of PM_PRESET_IDS) {
      expect(DESKTOP_PATCH, `missing preset row for ${presetId}`).toContain(`id: preset-pm-${presetId.replace('polymer-', '')}`)
      expect(DESKTOP_PATCH, `missing config id for ${presetId}`).toContain(`id: ${presetId}`)
    }
    expect(DESKTOP_PATCH).toContain(`name: '@deepseek-ai/dsh-agent-preset'`)
  })

  it('keeps pm-research composed so polymer skills register programmatically', () => {
    expect(DESKTOP_PATCH).toContain('dsh-plugin-desktop/pm')
    expect(DESKTOP_PATCH).toContain(`'@deepseek-ai/dsh-tool-skill'`)
  })

  it('declares each preset in a distinct insertion block with order for UI ranking', () => {
    const orders = PM_PRESET_IDS.map((presetId) => {
      const block = DESKTOP_PATCH.slice(DESKTOP_PATCH.indexOf(`id: ${presetId}`))
      const match = /order:\s*(\d+)/u.exec(block)
      return match?.[1]
    })
    for (const order of orders) expect(order, 'preset order missing').toBeDefined()
    expect(new Set(orders).size).toBe(PM_PRESET_IDS.length)
  })

  it('gives the reviewer a write-limited persona and the scientist the research constitution', () => {
    const reviewerBlock = DESKTOP_PATCH.slice(DESKTOP_PATCH.indexOf('id: polymer-reviewer'), DESKTOP_PATCH.indexOf('id: polymer-reviewer') + 2000)
    expect(reviewerBlock).toContain('independent reviewer')
    const scientistBlock = DESKTOP_PATCH.slice(DESKTOP_PATCH.indexOf('id: polymer-scientist'), DESKTOP_PATCH.indexOf('id: polymer-scientist') + 2600)
    expect(scientistBlock).toContain('Principal Investigator')
    expect(scientistBlock).toContain('Evidence')
  })
})
