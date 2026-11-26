/** Idempotent seed for the five polymer expert subagents used by the desktop
 * Superagent workflow.
 *
 * `dsh-agent-skill` only reads `<DSH_HOME>/agent-skill/agents.json`; it ships no
 * way to distribute agent definitions with a bundle. The desktop therefore
 * writes the expert team once, on the first boot where the tools and skills are
 * already registered, and never overwrites a store the user has edited.
 *
 * Each definition carries `agentPreset` (a patch on top of upstream 0.3.0), so
 * the child session runs under the expert's own polymer preset and the PM
 * permission matrix judges the expert role, not the caller's role. */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Store schema version understood by `dsh-agent-skill` 0.3.0. */
export const AGENT_TEAM_SEED_VERSION = 1

/** One subagent definition written into the Agent & Skill store. */
export interface SeedAgent {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly systemPrompt: string
  readonly mode: 'spawn'
  /**
   * Absolute delegation-depth cap for the child, not a "children allowed"
   * count: a root caller creates the child at depth 1, so 1 is the minimum that
   * permits creation. Recursion is blocked by the whitelist (no
   * `delegate_agent`) and by depth 2 exceeding this cap.
   */
  readonly maxDepth: 1
  readonly agentPreset: string
  readonly tools: readonly string[]
  readonly skills: readonly string[]
}

/** Complete store payload (mirrors the plugin's own `{version, agents, rank}`). */
export interface AgentTeamSeed {
  readonly version: typeof AGENT_TEAM_SEED_VERSION
  readonly agents: readonly SeedAgent[]
  readonly rank: readonly string[]
}

/** Outcome of one seed attempt. */
export interface AgentTeamSeedResult {
  readonly created: boolean
  readonly path: string
  readonly agents: readonly string[]
  readonly warnings: readonly string[]
  readonly skipped: 'existing' | 'none' | undefined
  /** Experts whose whitelist was extended by the current release's migration. */
  readonly upgraded?: readonly string[]
}

/** Best-effort logger seam so the seed never depends on a Cordis context. */
export interface AgentTeamSeedLogger {
  info(message: string): void
  warn(message: string): void
}

interface AgentBlueprint {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly preset: string
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly contract: string
}

const OUTPUT_RULE = '只输出一个 JSON 对象，不要写散文、不要 markdown 代码围栏；'
  + '每条结论必须带 evidenceIds（来自 pm_evidence_query / kb_rag / pm_mechanism_query），'
  + '没有证据就写 gaps，不要编造。完成即返回，不得调用 delegate_agent。'

/** The shell tool the desktop actually mounts on this platform. */
function shellTool(): string {
  return process.platform === 'win32' ? 'pwsh' : 'bash'
}

const BLUEPRINTS: readonly AgentBlueprint[] = Object.freeze([
  {
    id: 'agent_polymer_physicist',
    name: 'physicist',
    displayName: '高分子物理学家',
    description: '高分子物理与机理：链统计、橡胶弹性、粘弹、相分离、扩散与假设推理。',
    preset: 'polymer-physicist',
    tools: [
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
      'read',
      'grep',
      'pwsh',
      'todo_write',
      'domain_route',
      'domain_scope',
      'domain_list',
      'domain_recall',
      'domain_remember',
    ],
    skills: ['polymer-physics', 'mechanism-discovery', 'simulation-workflow', 'data-analysis', 'domain-routing'],
    contract: '输出：{"findings":[],"hypotheses":[],"evidenceIds":[],"gaps":[],"nextActions":[]}',
  },
  {
    id: 'agent_polymer_characterization',
    name: 'characterization',
    displayName: '表征分析专家',
    description: 'WAXS/SAXS/FTIR/Hermans 取向与结晶表征、峰拟合、证据入库与图表报告。',
    preset: 'polymer-characterization',
    tools: [
      'pm_waxs_analyze',
      'pm_ftir_analyze',
      'pm_saxs_analyze',
      'pm_hermans_analyze',
      'pm_waxs_pro',
      'pm_sim_crystallization',
      'pm_model_fit',
      'pm_evidence_record',
      'pm_evidence_query',
      'pm_analysis_report',
      'pm_knowledge_propose',
      'pyenv_discover',
      'pyenv_create',
      'pyenv_install',
      'domain_route',
      'domain_scope',
      'domain_list',
      'domain_recall',
      'domain_remember',
      'read',
      'write',
      'grep',
      'pwsh',
      'todo_write',
    ],
    skills: ['waxs-analysis', 'ftir-analysis', 'saxs-analysis', 'waxs-pro-processing', 'optics-birefringence', 'data-analysis', 'python-env', 'domain-routing'],
    contract: '输出：{"measurements":[],"conditions":[],"evidenceIds":[],"fitQuality":{},"gaps":[]}',
  },
  {
    id: 'agent_polymer_modeler',
    name: 'modeler',
    displayName: '建模与仿真专家',
    description: '高分子解析/数值模拟、参数拟合、预测与适用边界。',
    preset: 'polymer-modeler',
    tools: [
      'pm_sim_chain_mechanics',
      'pm_sim_rubber_elasticity',
      'pm_sim_viscoelastic',
      'pm_sim_chain_stats',
      'pm_sim_crystallization',
      'pm_sim_flory_huggins',
      'pm_sim_tg_blend',
      'pm_sim_diffusion',
      'pm_sim_md_run',
      'pm_model_fit',
      'pm_experiment_plan',
      'pm_analysis_report',
      'pyenv_discover',
      'pyenv_create',
      'pyenv_install',
      'pyenv_uninstall',
      'pyenv_remove',
      'domain_route',
      'domain_scope',
      'domain_list',
      'domain_recall',
      'domain_remember',
      'read',
      'write',
      'pwsh',
      'todo_write',
    ],
    skills: ['simulation-workflow', 'polymer-physics', 'experiment-design', 'data-analysis', 'python-env', 'domain-routing'],
    contract: '输出：{"model":"","parameters":{},"goodnessOfFit":{},"predictions":[],"limits":[],"evidenceIds":[]}',
  },
  {
    id: 'agent_polymer_literature',
    name: 'literature',
    displayName: '文献情报专家',
    description: '论文检索/筛选/下载/入库、逐字引文与 DOI 证据；只报告库内真实命中。',
    preset: 'polymer-literature',
    tools: [
      'pm_literature_read',
      'pm_literature_extract',
      'pm_literature_search',
      'pm_literature_screen',
      'pm_literature_download',
      'pm_literature_browser_download',
      'pm_kb_note',
      'kb_ingest',
      'kb_search',
      'kb_rag',
      'kb_stats',
      'lit_find',
      'lit_import',
      'lit_check',
      'zotero_collections',
      'zotero_search',
      'zotero_browse',
      'zotero_item',
      'zotero_fulltext',
      'zotero_annotations',
      'zotero_notes',
      'zotero_download',
      'zotero_export',
      'lit_search',
      'lit_resolve_oa',
      'lit_sufficiency',
      'lit_harvest_run',
      'doc_route',
      'pdf_markdown',
      'read',
      'write',
      'todo_write',
      'domain_route',
      'domain_scope',
      'domain_list',
      'domain_recall',
      'domain_remember',
    ],
    skills: ['literature-review', 'lit-library', 'kb-grounded-answer', 'doc-routing', 'domain-routing'],
    contract: '输出：{"papers":[{"doi":"","title":"","year":0,"quartile":""}],"quotes":[{"text":"","page":0,"doi":""}],"evidenceIds":[],"gaps":[]}；库内无命中必须写 gaps，不得编造。',
  },
  {
    id: 'agent_polymer_reviewer',
    name: 'reviewer',
    displayName: '独立评审专家',
    description: '独立复核证据、机理边与结论门；只读，不写数据、不改假设、不做新分析。',
    preset: 'polymer-reviewer',
    tools: [
      'pm_gate_check',
      'pm_evidence_verify',
      'pm_evidence_query',
      'pm_knowledge_query',
      'pm_knowledge_review',
      'kb_search',
      'kb_rag',
      'zotero_fulltext',
      'ask_advisor',
      'domain_route',
      'domain_scope',
      'domain_list',
      'domain_recall',
      'read',
      'grep',
    ],
    skills: ['scientific-review', 'mechanism-discovery', 'data-analysis', 'domain-routing'],
    contract: '输出：{"verdict":"pass|revise|reject","violations":[],"missingEvidence":[],"requiredChanges":[]}',
  },
])

/** Whitelist entries added by 2.4.0. An existing store is extended only when its
 * tools/skills are still a subset of the previous release's blueprint; a store
 * with user-added names is left untouched. */
const UPGRADE_ADDITIONS: Readonly<Record<string, { tools: readonly string[]; skills: readonly string[] }>> = Object.freeze({
  physicist: {
    tools: ['cognition_remember'],
    skills: ['data-analysis'],
  },
  characterization: {
    tools: ['pyenv_discover', 'pyenv_create', 'pyenv_install', 'cognition_context', 'cognition_recall', 'cognition_remember'],
    skills: ['data-analysis', 'python-env'],
  },
  modeler: {
    tools: ['pyenv_discover', 'pyenv_create', 'pyenv_install', 'pyenv_uninstall', 'pyenv_remove', 'cognition_context', 'cognition_recall', 'cognition_remember'],
    skills: ['data-analysis', 'python-env'],
  },
  literature: {
    tools: [
      'zotero_collections', 'zotero_search', 'zotero_browse', 'zotero_item', 'zotero_fulltext',
      'zotero_annotations', 'zotero_notes', 'zotero_download', 'zotero_export',
      'lit_search', 'lit_resolve_oa', 'lit_sufficiency', 'lit_harvest_run',
      'doc_route', 'pdf_markdown', 'cognition_remember',
    ],
    skills: ['doc-routing'],
  },
  reviewer: {
    tools: ['kb_search', 'kb_rag', 'zotero_fulltext', 'ask_advisor', 'cognition_context', 'cognition_recall'],
    skills: ['data-analysis'],
  },
})

/** 2.4.0 -> 2.5.0: replace raw cognition with domain-scoped memory tools and
 * add the domain protocol skill. Reviewer remains read-only (no domain_remember). */
const UPGRADE_2_5_0: Readonly<Record<string, {
  readonly addTools: readonly string[]
  readonly removeTools: readonly string[]
  readonly addSkills: readonly string[]
}>> = Object.freeze({
  physicist: {
    addTools: ['domain_route', 'domain_scope', 'domain_list', 'domain_recall', 'domain_remember'],
    removeTools: ['cognition_context', 'cognition_recall', 'cognition_remember'],
    addSkills: ['domain-routing'],
  },
  characterization: {
    addTools: ['domain_route', 'domain_scope', 'domain_list', 'domain_recall', 'domain_remember'],
    removeTools: ['cognition_context', 'cognition_recall', 'cognition_remember'],
    addSkills: ['domain-routing'],
  },
  modeler: {
    addTools: ['domain_route', 'domain_scope', 'domain_list', 'domain_recall', 'domain_remember'],
    removeTools: ['cognition_context', 'cognition_recall', 'cognition_remember'],
    addSkills: ['domain-routing'],
  },
  literature: {
    addTools: ['domain_route', 'domain_scope', 'domain_list', 'domain_recall', 'domain_remember'],
    removeTools: ['cognition_context', 'cognition_recall', 'cognition_remember'],
    addSkills: ['domain-routing'],
  },
  reviewer: {
    addTools: ['domain_route', 'domain_scope', 'domain_list', 'domain_recall'],
    removeTools: ['cognition_context', 'cognition_recall'],
    addSkills: ['domain-routing'],
  },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function isShellTool(name: string): boolean {
  return name === 'pwsh' || name === 'bash'
}

/** Extend pristine 2.3.0/2.4.0 expert stores with 2.5.0 domain tools.
 *
 * A store is upgraded only when its tools/skills are still a subset of a
 * previous release's blueprint. Custom whitelists and user-edited prompts are
 * preserved. The 2.4.0 prior blueprint is reconstructed from the live blueprint
 * by undoing the 2.5.0 add/remove sets, so this function does not need a second
 * large literal that could drift. */
function upgradeAgentStore(
  store: Record<string, unknown>,
  logger?: AgentTeamSeedLogger,
): { agents: unknown[]; upgraded: string[] } {
  const agents = Array.isArray(store.agents) ? store.agents : []
  const records = agents.filter(isRecord)
  const upgraded: string[] = []
  for (const blueprint of BLUEPRINTS) {
    const spec = UPGRADE_2_5_0[blueprint.name]
    if (spec === undefined) continue
    const existing = records.find((agent) => agent.id === blueprint.id)
      ?? records.find((agent) => agent.name === blueprint.name)
    if (existing === undefined) continue
    const existingTools = asStringArray(existing.tools)
    const existingSkills = asStringArray(existing.skills)
    const alreadyCurrent = spec.removeTools.every(tool => !existingTools.includes(tool))
      && spec.addTools.every(tool => existingTools.includes(tool))
      && spec.addSkills.every(skill => existingSkills.includes(skill))
    if (alreadyCurrent) continue

    // Reconstruct the 2.4.0 blueprint: undo the 2.5.0 additions and restore the
    // raw cognition tools that 2.5.0 removes.
    const prior24Tools = blueprint.tools.filter(tool => !spec.addTools.includes(tool))
    for (const tool of spec.removeTools) if (!prior24Tools.includes(tool)) prior24Tools.push(tool)
    const prior24Skills = blueprint.skills.filter(skill => !spec.addSkills.includes(skill))
    const prior24 = { ...blueprint, tools: prior24Tools, skills: prior24Skills }
    const additions24 = UPGRADE_ADDITIONS[blueprint.name] ?? { tools: [], skills: [] }
    const prior23Tools = prior24Tools.filter(tool => !additions24.tools.includes(tool))
    const prior23Skills = prior24Skills.filter(skill => !additions24.skills.includes(skill))
    const prior23 = { ...blueprint, tools: prior23Tools, skills: prior23Skills }

    const prior24ToolSet = new Set(prior24Tools)
    const prior24SkillSet = new Set(prior24Skills)
    const prior23ToolSet = new Set(prior23Tools)
    const prior23SkillSet = new Set(prior23Skills)
    const subset = (values: readonly string[], allowed: ReadonlySet<string>, shellAware: boolean): boolean =>
      values.every(value => (shellAware && isShellTool(value)) || allowed.has(value))
    const from24 = subset(existingTools, prior24ToolSet, true)
      && subset(existingSkills, prior24SkillSet, false)
    const from23 = subset(existingTools, prior23ToolSet, true)
      && subset(existingSkills, prior23SkillSet, false)
    if (!from24 && !from23) {
      logger?.info(`agent team: ${blueprint.name} has a customized whitelist; not upgraded`)
      continue
    }

    let nextTools = existingTools.filter(tool => !spec.removeTools.includes(tool))
    let nextSkills = [...existingSkills]
    if (from23) {
      for (const tool of additions24.tools) if (!nextTools.includes(tool)) nextTools.push(tool)
      for (const skill of additions24.skills) if (!nextSkills.includes(skill)) nextSkills.push(skill)
    }
    for (const tool of spec.addTools) if (!nextTools.includes(tool)) nextTools.push(tool)
    for (const skill of spec.addSkills) if (!nextSkills.includes(skill)) nextSkills.push(skill)

    const priorPromptMatched = existing.systemPrompt === legacySystemPrompt(prior24)
      || existing.systemPrompt === legacySystemPrompt(prior23)
    if (priorPromptMatched) existing.systemPrompt = systemPrompt(blueprint)
    if (nextTools.length !== existingTools.length
      || nextSkills.length !== existingSkills.length
      || priorPromptMatched) {
      existing.tools = nextTools
      existing.skills = nextSkills
      upgraded.push(blueprint.name)
    }
  }
  return { agents, upgraded }
}

/** The pre-2.5.0 expert prompt (kept verbatim for migration comparisons). */
function legacySystemPrompt(blueprint: AgentBlueprint): string {
  return [
    `你是 PolyMechanism Studio 的${blueprint.displayName}（子代理名 ${blueprint.name}）。`,
    `执行任务时以 ${blueprint.preset} preset 运行，只能使用给定的工具白名单与技能；`,
    '不要做其他专家的工作，也不要派发子代理。',
    OUTPUT_RULE,
    blueprint.contract,
  ].join('')
}

function systemPrompt(blueprint: AgentBlueprint): string {
  return [
    `你是 PolyMechanism Studio 的${blueprint.displayName}（子代理名 ${blueprint.name}）。`,
    `执行任务时以 ${blueprint.preset} preset 运行，只能使用给定的工具白名单与技能；`,
    '不要做其他专家的工作，也不要派发子代理。',
    '做任何检索/文献/记忆前，先用 domain_route 判断领域并用 domain_scope 设 active domain；'
      + 'KB/Zotero/lit-library 调用必须带 domain；文献结论默认 kind=pdf；'
      + '跨域只在 crossDomain=true 时查 relatedDomains，并标明来源 domain。',
    '领域经验只写 domain_remember（Reviewer 只 recall），不得调用原始 cognition_remember/recall；'
      + '记忆不是证据，没有 evidenceId 就写 gaps。',
    OUTPUT_RULE,
    blueprint.contract,
  ].join('')
}

/** Build the seed payload, filtering every tool/skill against the live registry.
 *
 * A definition whose filtered tool list drops below three entries is omitted:
 * starting it would silently expose the full preset tool surface instead of the
 * intended expert surface. */
export function buildAgentTeam(
  availableTools: readonly string[],
  availableSkills: readonly string[],
  logger?: AgentTeamSeedLogger,
): { seed: AgentTeamSeed; warnings: string[] } {
  const toolSet = new Set(availableTools)
  const skillSet = new Set(availableSkills)
  const warnings: string[] = []
  const agents: SeedAgent[] = []

  for (const blueprint of BLUEPRINTS) {
    const missingTools = blueprint.tools
      .filter((tool) => tool !== 'pwsh' && tool !== 'bash' && !toolSet.has(tool))
    const missingSkills = blueprint.skills.filter((skill) => !skillSet.has(skill))
    for (const tool of missingTools) {
      warnings.push(`${blueprint.name}: tool not registered: ${tool}`)
    }
    for (const skill of missingSkills) {
      warnings.push(`${blueprint.name}: skill not registered: ${skill}`)
    }
    // The shell tool is chosen per platform, not by the blueprint literal.
    const tools = blueprint.tools
      .filter((tool) => tool !== 'pwsh' && tool !== 'bash')
      .filter((tool) => toolSet.has(tool))
    if (toolSet.has(shellTool())) tools.push(shellTool())
    const skills = blueprint.skills.filter((skill) => skillSet.has(skill))
    if (tools.length < 3) {
      warnings.push(`${blueprint.name}: only ${tools.length} whitelisted tools available; agent omitted`)
      continue
    }
    agents.push(Object.freeze({
      id: blueprint.id,
      name: blueprint.name,
      displayName: blueprint.displayName,
      description: blueprint.description,
      systemPrompt: systemPrompt(blueprint),
      mode: 'spawn',
      maxDepth: 1,
      agentPreset: blueprint.preset,
      tools: Object.freeze(tools),
      skills: Object.freeze(skills),
    }))
  }

  for (const warning of warnings) logger?.warn(warning)
  return {
    seed: Object.freeze({
      version: AGENT_TEAM_SEED_VERSION,
      agents: Object.freeze(agents),
      rank: Object.freeze(agents.map((agent) => agent.id)),
    }),
    warnings,
  }
}

function storePath(homeDir: string): string {
  return join(homeDir, 'agent-skill', 'agents.json')
}

async function quarantine(file: string, logger?: AgentTeamSeedLogger): Promise<void> {
  const backup = `${file}.bak-${Date.now().toString(36)}`
  try {
    await rename(file, backup)
    logger?.warn(`agent team: moved unusable store to ${backup}`)
  } catch (cause) {
    logger?.warn(`agent team: could not back up ${file}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

/** Seed before the Host boots: the Agent & Skill plugin reads its store during
 * `apply`, so a store written after `markReady` would leave the first turn with
 * an empty `delegate_agent` catalog. The blueprints are the contract; unknown
 * names are harmless (the child's allowlist simply never matches them) and the
 * post-boot audit reports any that the installed bundles did not register. */
export async function seedAgentTeamForBoot(
  homeDir: string,
  logger?: AgentTeamSeedLogger,
): Promise<AgentTeamSeedResult> {
  const tools = new Set<string>()
  const skills = new Set<string>()
  for (const blueprint of BLUEPRINTS) {
    for (const tool of blueprint.tools) {
      if (tool !== 'pwsh' && tool !== 'bash') tools.add(tool)
    }
    tools.add(shellTool())
    for (const skill of blueprint.skills) skills.add(skill)
  }
  return seedAgentTeam(homeDir, [...tools], [...skills], logger)
}

/** Report whitelisted names the installed profile did not register. Read-only:
 * the seed never rewrites an existing (possibly user-edited) store. */
export async function auditAgentTeam(
  homeDir: string,
  availableTools: readonly string[],
  availableSkills: readonly string[],
): Promise<{ agents: number; missingTools: string[]; missingSkills: string[] }> {
  const file = storePath(homeDir)
  if (!existsSync(file)) return { agents: 0, missingTools: [], missingSkills: [] }
  let agents: unknown[] = []
  try {
    const parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')) as { agents?: unknown }
    agents = Array.isArray(parsed.agents) ? parsed.agents : []
  } catch {
    return { agents: 0, missingTools: [], missingSkills: [] }
  }
  const toolSet = new Set(availableTools)
  const skillSet = new Set(availableSkills)
  const missingTools = new Set<string>()
  const missingSkills = new Set<string>()
  for (const raw of agents) {
    const agent = raw as { tools?: unknown; skills?: unknown }
    if (Array.isArray(agent.tools)) {
      for (const tool of agent.tools) {
        if (typeof tool === 'string' && !toolSet.has(tool)) missingTools.add(tool)
      }
    }
    if (Array.isArray(agent.skills)) {
      for (const skill of agent.skills) {
        if (typeof skill === 'string' && !skillSet.has(skill)) missingSkills.add(skill)
      }
    }
  }
  return { agents: agents.length, missingTools: [...missingTools].sort(), missingSkills: [...missingSkills].sort() }
}

export async function seedAgentTeam(
  homeDir: string,
  availableTools: readonly string[],
  availableSkills: readonly string[],
  logger?: AgentTeamSeedLogger,
): Promise<AgentTeamSeedResult> {
  const file = storePath(homeDir)
  const { seed, warnings } = buildAgentTeam(availableTools, availableSkills, logger)

  if (existsSync(file)) {
    let parsed: Record<string, unknown> | undefined
    try {
      const candidate: unknown = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, ''))
      if (isRecord(candidate) && Array.isArray(candidate.agents) && candidate.agents.length > 0) {
        parsed = candidate
      }
    } catch {
      parsed = undefined
    }
    if (parsed !== undefined) {
      const { agents, upgraded } = upgradeAgentStore(parsed, logger)
      if (upgraded.length > 0) {
        const temporary = `${file}.${process.pid}.tmp`
        await writeFile(temporary, `${JSON.stringify({ ...parsed, agents }, null, 2)}\n`, 'utf8')
        await rename(temporary, file)
        logger?.info(`agent team: upgraded ${upgraded.join(', ')} whitelists`)
        return { created: false, path: file, agents: upgraded, warnings, skipped: undefined, upgraded }
      }
      logger?.info('agent team: skipped existing definitions')
      return { created: false, path: file, agents: [], warnings, skipped: 'existing' }
    }
    await quarantine(file, logger)
  }

  if (seed.agents.length === 0) {
    logger?.warn('agent team: no expert had enough registered tools; nothing written')
    return { created: false, path: file, agents: [], warnings, skipped: 'none' }
  }

  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
  logger?.info(`agent team: seeded ${seed.agents.map((agent) => agent.name).join(', ')}`)
  return {
    created: true,
    path: file,
    agents: seed.agents.map((agent) => agent.name),
    warnings,
    skipped: undefined,
  }
}
