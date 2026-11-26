/** Polymer methodology skills: repo SKILL.md assets registered into the host skill registry. */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only convergence: the skill package augments `Context.skills`.
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-skill'

/** The planned methodology catalog (docs 06 §3.1); the repo skills/ tree is the source of truth. */
export const PM_SKILL_NAMES: readonly string[] = Object.freeze([
  'polymer-physics',
  'pva-oblique-stretching',
  'mechanism-discovery',
  'literature-review',
  'waxs-analysis',
  'ftir-analysis',
  'saxs-analysis',
  'optics-birefringence',
  'simulation-workflow',
  'experiment-design',
  'scientific-review',
  'research-project-management',
  'waxs-pro-processing',
  'data-analysis',
  'kb-grounded-answer',
  'polymer-chief-route',
  'domain-routing',
])

/** Repo skills directory, resolved from this module so both dev and packaged hosts find it. */
export function skillsRoot(): string {
  return resolve(import.meta.dirname, '..', '..', '..', 'skills')
}

/** Parsed frontmatter of one SKILL.md. */
export interface ParsedSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly content: string
}

/**
 * Parse one SKILL.md (frontmatter: name/description/whenToUse; body = instructions).
 * Uses plain string slicing so no regular-expression engine is involved.
 * @param raw - file contents.
 * @param fallbackName - name used when frontmatter omits it.
 */
export function parseSkillMarkdown(raw: string, fallbackName: string): ParsedSkill | undefined {
  const fence = '---'
  if (!raw.startsWith(`${fence}\n`)) return undefined
  const headerEnd = raw.indexOf(`\n${fence}\n`, fence.length)
  if (headerEnd < 0) return undefined
  const header = raw.slice(fence.length + 1, headerEnd)
  const body = raw.slice(headerEnd + fence.length + 2)
  const fields = new Map<string, string>()
  for (const line of header.split('\n')) {
    const index = line.indexOf(':')
    if (index > 0) fields.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
  }
  const name = fields.get('name') ?? fallbackName
  const description = fields.get('description') ?? ''
  if (name.length === 0 || description.length === 0) return undefined
  const whenToUse = fields.get('whenToUse')
  return {
    name,
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    content: body.trim(),
  }
}

/**
 * Load every skill definition from the repo skills tree (missing dir → empty).
 * @param root - skills root; defaults to the repo tree beside this package.
 */
export async function loadSkillDefinitions(root: string = skillsRoot()): Promise<SkillRegistration[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const definitions: SkillRegistration[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(root, entry.name, 'SKILL.md'), 'utf8')
      const parsed = parseSkillMarkdown(raw, entry.name)
      if (parsed === undefined) continue
      definitions.push({
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
        content: parsed.content,
        // The registry requires a provider-visible origin for every skill; the
        // repo tree is product-bundled rather than user-authored.
        source: 'bundled',
        path: join(root, entry.name, 'SKILL.md'),
        resourceBase: { kind: 'directory', path: join(root, entry.name) },
      })
    } catch {
      // Unreadable skill stays out of the catalog; the file remains on disk.
    }
  }
  return definitions
}

/**
 * Register every polymer skill on the host skill registry.
 * @param ctx - Host context providing `skills`.
 */
export function registerSkills(ctx: Context): void {
  ctx.inject(['skills'], (scope) => {
    void loadSkillDefinitions().then((definitions) => {
      for (const definition of definitions) scope.skills.register(definition)
    }).catch(() => {})
  })
}
