/** The desktop seeds the five polymer expert subagents exactly once and never
 * overwrites a store the user has edited. */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAgentTeam, seedAgentTeam, seedAgentTeamForBoot, auditAgentTeam, type AgentTeamSeedLogger } from '../src/agent-team-seed.ts'

const homes: string[] = []

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-agent-seed-'))
  homes.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const TOOLS = [
  'pm_hypothesis_propose',
  'pm_mechanism_query',
  'pm_mechanism_propose_edge',
  'pm_evidence_query',
  'pm_knowledge_query',
  'pm_sim_chain_mechanics',
  'pm_sim_rubber_elasticity',
  'pm_sim_viscoelastic',
  'pm_sim_chain_stats',
  'pm_sim_flory_huggins',
  'pm_sim_tg_blend',
  'pm_sim_diffusion',
  'pm_model_fit',
  'pm_experiment_plan',
  'pm_gate_check',
  'pm_waxs_analyze',
  'pm_ftir_analyze',
  'pm_saxs_analyze',
  'pm_hermans_analyze',
  'pm_waxs_pro',
  'pm_sim_crystallization',
  'pm_evidence_record',
  'pm_analysis_report',
  'pm_knowledge_propose',
  'pm_sim_md_run',
  'pm_literature_read',
  'pm_literature_extract',
  'pm_literature_search',
  'pm_literature_screen',
  'pm_literature_download',
  'pm_literature_browser_download',
  'pm_kb_note',
  'pm_evidence_verify',
  'pm_knowledge_review',
  'kb_ingest',
  'kb_search',
  'kb_rag',
  'kb_stats',
  'lit_find',
  'lit_import',
  'lit_check',
  'cognition_context',
  'cognition_recall',
  'read',
  'write',
  'grep',
  'pwsh',
  'bash',
  'todo_write',
]

const SKILLS = [
  'polymer-physics',
  'mechanism-discovery',
  'simulation-workflow',
  'waxs-analysis',
  'ftir-analysis',
  'saxs-analysis',
  'waxs-pro-processing',
  'optics-birefringence',
  'experiment-design',
  'literature-review',
  'lit-library',
  'kb-grounded-answer',
  'scientific-review',
]

function quietLogger(): {
  logger: AgentTeamSeedLogger
  info: string[]
  warn: string[]
} {
  const info: string[] = []
  const warn: string[] = []
  return {
    logger: { info: (message) => info.push(message), warn: (message) => warn.push(message) },
    info,
    warn,
  }
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('buildAgentTeam', () => {
  it('builds five experts with the target presets and bounded tool lists', () => {
    const { seed, warnings } = buildAgentTeam(TOOLS, SKILLS)
    expect(seed.version).toBe(1)
    expect(seed.agents.map((agent) => agent.name)).toEqual([
      'physicist',
      'characterization',
      'modeler',
      'literature',
      'reviewer',
    ])
    expect(seed.rank).toEqual(seed.agents.map((agent) => agent.id))
    expect(warnings).toEqual([])
    for (const agent of seed.agents) {
      expect(agent.mode).toBe('spawn')
      expect(agent.maxDepth).toBe(1)
      expect(agent.tools.length).toBeGreaterThanOrEqual(3)
      expect(agent.tools.length).toBeLessThanOrEqual(20)
      expect(agent.agentPreset).toMatch(/^polymer-/u)
      expect(agent.systemPrompt).toContain('evidenceIds')
    }
    expect(seed.agents.map((agent) => agent.agentPreset)).toEqual([
      'polymer-physicist',
      'polymer-characterization',
      'polymer-modeler',
      'polymer-literature',
      'polymer-reviewer',
    ])
  })

  it('filters unknown tools and drops an expert whose surface would be too small', () => {
    const { seed, warnings } = buildAgentTeam(['read', 'grep'], SKILLS)
    expect(seed.agents).toEqual([])
    expect(warnings.some((warning) => warning.includes('agent omitted'))).toBe(true)
  })

  it('keeps a specialist when at least three whitelisted tools survive', () => {
    const { seed } = buildAgentTeam(
      ['pm_knowledge_review', 'pm_evidence_verify', 'pm_evidence_query'],
      ['scientific-review'],
    )
    expect(seed.agents.map((agent) => agent.name)).toEqual(['reviewer'])
    expect(seed.agents[0]?.skills).toEqual(['scientific-review'])
  })
})

describe('seedAgentTeam', () => {
  it('writes the store on first boot', async () => {
    const dir = home()
    const { logger, info } = quietLogger()
    const result = await seedAgentTeam(dir, TOOLS, SKILLS, logger)
    expect(result.created).toBe(true)
    expect(result.skipped).toBeUndefined()
    expect(result.agents).toEqual(['physicist', 'characterization', 'modeler', 'literature', 'reviewer'])
    const stored = JSON.parse(readFileSync(join(dir, 'agent-skill', 'agents.json'), 'utf8'))
    expect(stored.version).toBe(1)
    expect(stored.agents).toHaveLength(5)
    expect(stored.rank).toHaveLength(5)
    expect(info.some((line) => line.includes('seeded'))).toBe(true)  })

  it('does not overwrite an existing non-empty store', async () => {
    const dir = home()
    await seedAgentTeam(dir, TOOLS, SKILLS)
    const file = join(dir, 'agent-skill', 'agents.json')
    const before = digest(file)
    const beforeMtime = statSync(file).mtimeMs

    const result = await seedAgentTeam(dir, TOOLS, SKILLS)
    expect(result.created).toBe(false)
    expect(result.skipped).toBe('existing')
    expect(digest(file)).toBe(before)
    expect(statSync(file).mtimeMs).toBe(beforeMtime)
  })

  it('preserves a user edit on the next boot', async () => {
    const dir = home()
    await seedAgentTeam(dir, TOOLS, SKILLS)
    const file = join(dir, 'agent-skill', 'agents.json')
    const store = JSON.parse(readFileSync(file, 'utf8'))
    store.agents[0].description = 'my edited physicist'
    writeFileSync(file, JSON.stringify(store, null, 2))

    await seedAgentTeam(dir, TOOLS, SKILLS)
    const after = JSON.parse(readFileSync(file, 'utf8'))
    expect(after.agents[0].description).toBe('my edited physicist')
  })

  it('backs up and rebuilds a corrupt store', async () => {
    const dir = home()
    const file = join(dir, 'agent-skill', 'agents.json')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, 'agent-skill'), { recursive: true })
    writeFileSync(file, '{not json')

    const result = await seedAgentTeam(dir, TOOLS, SKILLS)
    expect(result.created).toBe(true)
    const backups = readdirSync(join(dir, 'agent-skill')).filter((name) => name.startsWith('agents.json.bak-'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(readFileSync(file, 'utf8')).agents).toHaveLength(5)
  })

  it('does not write an empty store when no registry is available', async () => {
    const dir = home()
    const result = await seedAgentTeam(dir, [], [])
    expect(result.created).toBe(false)
    expect(result.skipped).toBe('none')
    expect(readdirSync(dir)).toEqual([])
  })

  it('seeds before boot without waiting for a live registry', async () => {
    const dir = home()
    const result = await seedAgentTeamForBoot(dir)
    expect(result.created).toBe(true)
    const stored = JSON.parse(readFileSync(join(dir, 'agent-skill', 'agents.json'), 'utf8'))
    expect(stored.agents).toHaveLength(5)
    for (const agent of stored.agents) {
      expect(agent.tools).toContain(process.platform === 'win32' ? 'pwsh' : 'bash')
      expect(agent.tools).not.toContain(process.platform === 'win32' ? 'bash' : 'pwsh')
    }
  })

  it('audits missing whitelisted names without rewriting the store', async () => {
    const dir = home()
    await seedAgentTeamForBoot(dir)
    const file = join(dir, 'agent-skill', 'agents.json')
    const before = digest(file)
    const audit = await auditAgentTeam(dir, ['read', 'grep'], ['polymer-physics'])
    expect(audit.agents).toBe(5)
    expect(audit.missingTools).toContain('pm_gate_check')
    expect(audit.missingSkills).toContain('kb-grounded-answer')
    expect(digest(file)).toBe(before)
  })
})
