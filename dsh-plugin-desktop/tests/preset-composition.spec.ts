import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

/** The Cordis YAML dialect parses `!!js` scalars as expression nodes. */
const JS_TAG = { tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }

const POLYMER_PRESETS = [
  'polymer-scientist',
  'polymer-physicist',
  'polymer-characterization',
  'polymer-modeler',
  'polymer-literature',
  'polymer-reviewer',
] as const

interface PresetRow {
  readonly id?: string
  readonly name?: string
  readonly disabled?: unknown
  readonly group?: boolean
  readonly config?: unknown
}

function readPatch(path: URL): PresetRow[] {
  const document = parse(readFileSync(path, 'utf8'), { customTags: [JS_TAG] })
  const insert = (document as Array<{ insert?: PresetRow[] }>).find(row => Array.isArray(row.insert))?.insert
  if (insert === undefined) throw new Error(`patch has no insert list: ${path.pathname}`)
  return insert
}

function presetPlugins(row: PresetRow): PresetRow[] {
  const config = row.config as { plugins?: PresetRow[] } | undefined
  return config?.plugins ?? []
}

/** The `standard` preset nests plan/compaction/delegation plugins in group config arrays. */
function flattenPluginNames(plugins: readonly PresetRow[]): string[] {
  const names: string[] = []
  for (const plugin of plugins) {
    if (typeof plugin.name === 'string') names.push(plugin.name)
    if (Array.isArray(plugin.config)) names.push(...flattenPluginNames(plugin.config as PresetRow[]))
  }
  return names
}

function standardPluginNames(): string[] {
  const standard = readPatch(new URL(
    '../node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
    import.meta.url,
  )).find(row => row.name === '@deepseek-ai/dsh-agent-preset')
  if (standard === undefined) throw new Error('installed web-app bundle has no standard preset')
  return [...new Set(flattenPluginNames(presetPlugins(standard)))].sort()
}

function polymerPresetRows(): Map<string, PresetRow> {
  const rows = readPatch(new URL('../cordis.patch.yml', import.meta.url))
    .filter(row => row.name === '@deepseek-ai/dsh-agent-preset')
    .map(row => row as PresetRow & { config: { id: string } })
  return new Map(rows.map(row => [row.config.id, row]))
}

describe('polymer expert preset composition', () => {
  it('declares every polymer expert exactly once', () => {
    const presets = polymerPresetRows()
    expect([...presets.keys()].sort()).toEqual([...POLYMER_PRESETS].sort())
  })

  it.each(POLYMER_PRESETS)('%s carries the complete standard DSH tool surface', (presetId) => {
    const preset = polymerPresetRows().get(presetId)
    expect(preset).toBeDefined()
    const names = flattenPluginNames(presetPlugins(preset!))
    expect(names.length).toBeGreaterThanOrEqual(32)
    expect([...new Set(names)].sort()).toEqual(standardPluginNames())
  })

  it.each(POLYMER_PRESETS)('%s keeps a role-specific persona prefix', (presetId) => {
    const preset = polymerPresetRows().get(presetId)
    const persona = presetPlugins(preset!).find(plugin => plugin.name === '@deepseek-ai/dsh-persona')
    const prefix = (persona?.config as { prefix?: string } | undefined)?.prefix ?? ''
    expect(prefix.length).toBeGreaterThan(200)
    expect(prefix).toContain('PolyMechanism Studio')
    expect(prefix).toContain('standard DSH tool surface')
  })

  it.each(POLYMER_PRESETS)('%s can delegate to the polymer expert team', (presetId) => {
    const preset = polymerPresetRows().get(presetId)
    const persona = presetPlugins(preset!).find(plugin => plugin.name === '@deepseek-ai/dsh-persona')
    const prefix = (persona?.config as { prefix?: string } | undefined)?.prefix ?? ''
    expect(prefix).toContain('Delegation protocol (all polymer experts)')
    expect(prefix).toContain('delegate_agent')
    expect(prefix).toContain('polymer-chief-route')
    for (const expert of ['physicist', 'characterization', 'modeler', 'literature', 'reviewer']) {
      expect(prefix).toContain(expert)
    }
  })

  it('keeps the platform-specific shell tools and the standard capability groups', () => {
    const names = flattenPluginNames(presetPlugins(polymerPresetRows().get('polymer-scientist')!))
    for (const required of [
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
      '@deepseek-ai/dsh-tool-fs',
      '@deepseek-ai/dsh-tool-fs-search',
      '@deepseek-ai/dsh-tool-jobs',
      '@deepseek-ai/dsh-tool-schedule',
      '@deepseek-ai/dsh-skill-filesystem',
      '@deepseek-ai/dsh-tool-skill',
      '@deepseek-ai/dsh-command-goal',
      '@deepseek-ai/dsh-tool-goal',
      '@deepseek-ai/dsh-plan-mode',
      '@deepseek-ai/dsh-compaction-basic',
      '@deepseek-ai/dsh-command-compact',
      '@deepseek-ai/dsh-compaction-tool-result-pruner',
      '@deepseek-ai/dsh-tool-subagent-control',
      '@deepseek-ai/dsh-tool-subagent-control/list-agents',
      '@deepseek-ai/dsh-tool-subagent',
      '@deepseek-ai/dsh-workflow-ptc',
      '@deepseek-ai/dsh-tool-workflow',
      '@deepseek-ai/dsh-tool-ask-user',
      '@deepseek-ai/dsh-tool-todo',
      '@deepseek-ai/dsh-tool-web',
      '@deepseek-ai/dsh-tool-present',
      '@deepseek-ai/dsh-plugin-manager/tools',
      '@deepseek-ai/dsh-plugin-market/tools',
    ]) {
      expect(names).toContain(required)
    }
  })
})
