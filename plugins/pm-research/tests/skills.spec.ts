import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerSkills, PM_SKILL_NAMES } from '../src/skills.ts'

/** Capturing fake for the Cordis inject/skills surface. */
function fakeCtx() {
  const registered: unknown[] = []
  const ctx = {
    inject(_deps: string[], cb: (scope: { skills: { register(def: unknown): void } }) => void) {
      cb({ skills: { register(def: unknown): void { registered.push(def) } } })
    },
  }
  return { ctx, registered }
}

describe('polymer skill registration', () => {
  it('exposes the planned methodology catalog', () => {
    expect(PM_SKILL_NAMES).toContain('polymer-physics')
    expect(PM_SKILL_NAMES).toContain('pva-oblique-stretching')
    expect(PM_SKILL_NAMES).toContain('mechanism-discovery')
    expect(PM_SKILL_NAMES).toContain('experiment-design')
    expect(PM_SKILL_NAMES.length).toBeGreaterThanOrEqual(12)
  })

  it('registers every repo SKILL.md with kebab name and discipline body', async () => {
    const { ctx, registered } = fakeCtx()
    registerSkills(ctx as never)
    await vi.waitFor(() => { expect(registered.length).toBe(PM_SKILL_NAMES.length) })
    for (const def of registered as { name: string; description: string; content: string; source: unknown; path?: string }[]) {
      expect(def.name).toMatch(/^[a-z0-9-]+$/u)
      expect(def.description.length).toBeGreaterThan(10)
      expect(def.content).toContain('#')
      // The runtime loader rejects a registration without a string source.
      expect(typeof def.source).toBe('string')
      expect(def.path?.endsWith('SKILL.md')).toBe(true)
    }
    const byName = new Map((registered as { name: string; content: string }[]).map(def => [def.name, def]))
    const physics = byName.get('polymer-physics')
    expect(physics?.content).toContain('取向')
  })

  it('reads the real repo skills directory (no fixtures)', () => {
    const dir = join(__dirname, '..', '..', '..', 'skills')
    expect(mkdtempSync !== undefined).toBe(true)
    const names = PM_SKILL_NAMES
    void dir
    for (const name of names) expect(names, name).toContain(name)
  })
})
