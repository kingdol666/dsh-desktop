/** Real Host acceptance for the polymer Superagent layer.
 *
 * Boots the same desktop profile composition the app loads, seeds the five
 * expert definitions before the Agent & Skill plugin applies, then proves:
 *   - `delegate_agent` and the four context-budget tools are registered;
 *   - `polymer-chief-route` is in the skill registry;
 *   - six caller presets can each delegate to a different expert;
 *   - every child session runs under the target expert's own polymer preset;
 *   - the child tool surface is the expert whitelist, not the caller's surface;
 *   - the five experts can execute their real tools (KB search, WAXS pro,
 *     hypothesis, gate, report) in one chain.
 *
 * Model calls are not required: the delegation tool is executed exactly as the
 * model would call it, and the child's scoped context executes its own tools.
 */

import { randomUUID } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import { installDesktopPnpmRuntime } from '../lib/desktop-runtime-environment.js'
import { installProfilePackageResolver } from '../lib/module-resolution.js'
import { DesktopPluginPackages } from '../lib/plugin-packages.js'
import { prepareDesktopProfile, syncDesktopManagedProfileBundles } from '../lib/profile.js'
import { DesktopProfileService } from '../lib/profile-service.js'
import { createDesktopProfileBoot } from '../lib/profile-context.js'
import { seedAgentTeamForBoot } from '../lib/agent-team-seed.js'

const BIN_NAME = 'dsh-plugin-desktop-agent-team-smoke'
const HOME = mkdtempSync(join(tmpdir(), 'dsh-desktop-agent-team-'))
process.env.DSH_HOME = HOME
const WORKSPACE = join(HOME, 'agent-team-workspace')
mkdirSync(WORKSPACE, { recursive: true })
// Domain isolation smoke: the temp workspace has one test domain whose KB is
// the workspace .kb. Active state lets pm_kb_note / kb_search resolve without
// an explicit domain while the real 2.5.0 strict path is exercised.
mkdirSync(join(WORKSPACE, 'domains', 'test'), { recursive: true })
writeFileSync(join(WORKSPACE, 'domains', 'test', 'domain.json'), JSON.stringify({
  id: 'test',
  name: 'Verification domain',
  kbRoot: '.kb',
  allowedKinds: ['pdf', 'txt', 'md'],
  defaultKind: 'all',
  relatedDomains: [],
}), 'utf8')
mkdirSync(join(WORKSPACE, '.pm-domain'), { recursive: true })
writeFileSync(join(WORKSPACE, '.pm-domain', 'state.json'), JSON.stringify({
  schemaVersion: 1,
  domain: 'test',
  updatedAt: new Date().toISOString(),
}), 'utf8')
process.chdir(WORKSPACE)
const realUserInfo = os.userInfo.bind(os)
os.userInfo = options => ({ ...realUserInfo(options), homedir: HOME })
os.homedir = () => HOME
syncBuiltinESMExports()

let ordinaryBrowserEnabled = false
const BROWSER_ACCESS = Object.freeze({
  get ordinaryBrowserEnabled() { return ordinaryBrowserEnabled },
  rendererHeader: Object.freeze({
    name: 'x-dsh-desktop-renderer',
    value: Buffer.alloc(32, 2).toString('base64url'),
  }),
  setOrdinaryBrowserEnabled(enabled) { ordinaryBrowserEnabled = enabled },
})
const LAN_HTTPS_SNAPSHOT = Object.freeze({
  state: 'inactive',
  actualPort: null,
  addresses: Object.freeze([]),
  caFingerprint: null,
  errorCode: null,
})
const LAN_HTTPS = Object.freeze({
  caCertificate: null,
  attach() {},
  snapshot() { return LAN_HTTPS_SNAPSHOT },
  async setEnabled() { return LAN_HTTPS_SNAPSHOT },
  async stop() { return LAN_HTTPS_SNAPSHOT },
})

const MATRIX = [
  { caller: 'polymer-scientist', target: 'literature', childPreset: 'polymer-literature' },
  { caller: 'polymer-physicist', target: 'characterization', childPreset: 'polymer-characterization' },
  { caller: 'polymer-characterization', target: 'modeler', childPreset: 'polymer-modeler' },
  { caller: 'polymer-modeler', target: 'physicist', childPreset: 'polymer-physicist' },
  { caller: 'polymer-literature', target: 'reviewer', childPreset: 'polymer-reviewer' },
  { caller: 'polymer-reviewer', target: 'characterization', childPreset: 'polymer-characterization' },
]

let ctx
let releasePackageResolver
let pnpmRuntime

try {
  const initial = prepareDesktopProfile('1', HOME, process.platform)
  syncDesktopManagedProfileBundles(initial.profile.dir, {
    market: initial.market.effective,
    aaEnabled: initial.aaEnabled,
  })
  const prepared = prepareDesktopProfile('1', HOME, process.platform)
  for (const bundle of ['dsh-agent-skill', '@bushizhanghan/dsh-context-budget']) {
    if (!prepared.profile.layers.some(layer => layer.packageName === bundle)) {
      throw new Error(`composed desktop profile does not carry ${bundle}; layers: ${prepared.profile.layers.map(layer => layer.packageName).join(', ')}`)
    }
  }

  // Seed before boot: the plugin reads its store during apply.
  const seeded = await seedAgentTeamForBoot(HOME)
  if (!seeded.created) throw new Error(`agent team seed did not create the store: ${JSON.stringify(seeded)}`)
  const stored = JSON.parse(readFileSync(seeded.path, 'utf8'))
  if (stored.agents.length !== 5) throw new Error(`seed wrote ${stored.agents.length} agents, expected 5`)

  const packageRoot = new URL('../', import.meta.url)
  const pnpmBinPath = fileURLToPath(new URL('node_modules/pnpm/bin/pnpm.mjs', packageRoot))
  const electronVersion = JSON.parse(
    readFileSync(new URL('node_modules/electron/package.json', packageRoot), 'utf8'),
  ).version
  pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    stateDir: join(HOME, 'runtime-commands'),
    environment: process.env,
  })
  releasePackageResolver = installProfilePackageResolver(prepared.bareModuleBaseUrl)
  const runtime = {
    platform: 'win32',
    locale: 'en',
    updates: {
      isPackaged: false,
      canDownload: true,
      currentVersion: '2.0.0',
      statePath: join(HOME, 'update-state.json'),
      request: async () => { throw new Error('agent-team smoke must not perform update requests') },
      confirmDownload: async () => false,
      showManualCheckResult: async () => {},
      downloadAndOpen: async () => {},
      notify: () => {},
    },
    schedule() { return async () => {} },
    async mountScheduled() {},
    show() {},
    registerTrayItem() { return { refresh() {}, dispose() {} } },
    openTerminal() {},
    setLocalePreference() {},
    setThemeSource() {},
    async requestRestart() {},
    prepareToQuit() {},
  }
  const pnpmBootstrap = {
    activeProfileName: 'desktop',
    activeProfileDir: prepared.profile.dir,
    homeDir: prepared.homeDir,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    nodeBinDir: pnpmRuntime.nodeBinDir,
    nodeShimPath: pnpmRuntime.nodeShimPath,
    clearEnvironmentPath: pnpmRuntime.clearEnvironmentPath,
    dshBootstrapPath: fileURLToPath(new URL('../lib/desktop-cli.js', import.meta.url)),
  }
  const profileBoot = createDesktopProfileBoot(prepared, pnpmBootstrap)
  ctx = await boot(
    BIN_NAME,
    prepared.rootConfig,
    [...prepared.patches],
    async (host) => {
      profileBoot.prepare(host)
      host.loader.internal = undefined
      await host.plugin(DesktopPluginPackages)
      host.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([]))
      host.provide('desktopBrowserAccess', BROWSER_ACCESS)
      host.provide('desktopLanHttps', LAN_HTTPS)
      host.provide('desktopRuntime', runtime)
      host.provide('desktopPnpmBootstrap', pnpmBootstrap)
      await host.plugin(DesktopProfileService, {
        current: { name: 'desktop', dir: prepared.profile.dir },
        list: () => [{
          name: 'desktop',
          dir: prepared.profile.dir,
          exists: true,
          bundles: prepared.profile.layers.map(layer => layer.packageName),
          webCapable: true,
        }],
        persistSelection: () => {},
        requestRestart: () => {},
      })
      provideCmdline(host, { args: ['--host', '127.0.0.1', '--port', '0'], exit: () => {} })
    },
    prepared.bareModuleBaseUrl,
  )
  profileBoot.markReady()

  const tools = ctx.get('tools')
  if (tools === undefined) throw new Error('assembled desktop profile is missing the tool registry')
  for (const name of ['delegate_agent', 'ctx_budget', 'ctx_budget_sweep', 'ctx_budget_skills', 'ctx_budget_tools']) {
    if (tools.get(name) === undefined) throw new Error(`tool ${name} did not register`)
  }
  const skills = ctx.get('skills')
  let skillNames = []
  const skillDeadline = Date.now() + 20_000
  while (Date.now() < skillDeadline) {
    const skillSnapshot = skills.snapshot !== undefined ? await skills.snapshot() : await skills.list()
    skillNames = (Array.isArray(skillSnapshot) ? skillSnapshot : skillSnapshot.skills).map(skill => skill.name)
    if (skillNames.includes('polymer-chief-route') && skillNames.includes('polymer-physics')) break
    await delay(200)
  }
  if (!skillNames.includes('polymer-chief-route')) {
    throw new Error(`polymer-chief-route skill missing; got ${skillNames.join(', ')}`)
  }
  const delegate = tools.get('delegate_agent')
  process.stdout.write(`verify-agent-team: global tools ${tools.schemas().length}\n`)
  const emptyWorkspace = join(HOME, 'empty-domain-workspace')
  mkdirSync(emptyWorkspace, { recursive: true })
  const strictRaw = await tools.get('kb_search').execute(
    { query: 'PVA' },
    {
      agent: { id: 'verify-strict-domain', session: { header: { cwd: emptyWorkspace } } },
      signal: new AbortController().signal,
    },
  )
  const strictResult = typeof strictRaw === 'string' ? JSON.parse(strictRaw) : strictRaw
  if (strictResult?.error?.code !== 'DOMAIN_REQUIRED') {
    throw new Error(`strict domain rejection failed: ${JSON.stringify(strictResult).slice(0, 500)}`)
  }
  process.stdout.write('verify-agent-team: strict DOMAIN_REQUIRED rejection ok\n')
  if (process.env.VERIFY_CTX_BUDGET_DIR) {
    const exec = { agent: { id: 'verify-ctx-budget' }, signal: new AbortController().signal }
    const budget = await tools.get('ctx_budget').execute({ dir: process.env.VERIFY_CTX_BUDGET_DIR }, exec)
    const parsedBudget = typeof budget === 'string' ? JSON.parse(budget) : budget
    if (parsedBudget?.ok !== true || parsedBudget?.composition === undefined) {
      throw new Error(`ctx_budget did not audit a real session: ${JSON.stringify(parsedBudget).slice(0, 400)}`)
    }
    const toolAudit = await tools.get('ctx_budget_tools').execute({ dir: process.env.VERIFY_CTX_BUDGET_DIR }, exec)
    const parsedTools = typeof toolAudit === 'string' ? JSON.parse(toolAudit) : toolAudit
    if (parsedTools?.ok !== true || !Array.isArray(parsedTools?.groups)) {
      throw new Error(`ctx_budget_tools did not report groups: ${JSON.stringify(parsedTools).slice(0, 400)}`)
    }
    process.stdout.write(
      `verify-agent-team: ctx_budget wasteRatio=${String(parsedBudget.wasteRatio)} `
        + `toolGroups=${parsedTools.groups.length}\n`,
    )
  }
  const parseToolResult = (value) => (typeof value === 'string' ? JSON.parse(value) : value)
  if (process.env.VERIFY_COGNITION === '1') {
    const exec = { agent: { id: 'verify-cognition' }, signal: new AbortController().signal }
    const marker = `verify-230-memory-${Date.now().toString(36)}`
    const stored = parseToolResult(await tools.get('cognition_remember').execute({
      text: `${marker}：PVA 报告必须给出单位与不确定度。`,
      subject: marker,
      tags: ['verify-230', 'pref'],
      source: 'test',
      scope: 'global',
    }, exec))
    if (typeof stored?.stored?.id !== 'string') {
      throw new Error(`cognition_remember did not return an id: ${JSON.stringify(stored).slice(0, 400)}`)
    }
    const recalled = parseToolResult(await tools.get('cognition_recall').execute({
      query: `${marker} 单位 不确定度`,
      tags: ['verify-230'],
      limit: 5,
      mode: 'associative',
    }, exec))
    if (!Array.isArray(recalled?.hits) || !recalled.hits.some(hit => String(hit.content).includes(marker))) {
      throw new Error(`cognition_recall missed the test memory: ${JSON.stringify(recalled).slice(0, 400)}`)
    }
    const forgot = parseToolResult(await tools.get('cognition_forget').execute({ id: stored.stored.id }, exec))
    process.stdout.write(
      `verify-agent-team: cognition remember/recall/forget ok id=${stored.stored.id} `
        + `hits=${recalled.hits.length} removed=${String(forgot?.removed ?? '?')}\n`,
    )
    const otherWorkspace = join(WORKSPACE, 'other-cognition-workspace')
    mkdirSync(otherWorkspace, { recursive: true })
    const wsMarker = `verify-workspace-memory-${Date.now().toString(36)}`
    const wsExec = {
      agent: { id: 'verify-cognition-ws', session: { header: { cwd: WORKSPACE } } },
      signal: new AbortController().signal,
    }
    const otherExec = {
      agent: { id: 'verify-cognition-other', session: { header: { cwd: otherWorkspace } } },
      signal: new AbortController().signal,
    }
    const wsStored = parseToolResult(await tools.get('cognition_remember').execute({
      text: `${wsMarker}：PVA 域内规则只在该工作区可见。`,
      subject: wsMarker,
      tags: ['verify-ws'],
      source: 'test',
      scope: 'workspace',
    }, wsExec))
    if (typeof wsStored?.stored?.id !== 'string') {
      throw new Error(`workspace cognition_remember failed: ${JSON.stringify(wsStored).slice(0, 400)}`)
    }
    const wsRecalled = parseToolResult(await tools.get('cognition_recall').execute({
      query: wsMarker,
      tags: ['verify-ws'],
      limit: 5,
      scope: 'workspace',
    }, wsExec))
    if (!Array.isArray(wsRecalled?.hits) || !wsRecalled.hits.some(hit => String(hit.content).includes(wsMarker))) {
      throw new Error(`workspace cognition_recall missed the memory: ${JSON.stringify(wsRecalled).slice(0, 400)}`)
    }
    const otherRecalled = parseToolResult(await tools.get('cognition_recall').execute({
      query: wsMarker,
      tags: ['verify-ws'],
      limit: 5,
      scope: 'workspace',
    }, otherExec))
    if (Array.isArray(otherRecalled?.hits) && otherRecalled.hits.some(hit => String(hit.content).includes(wsMarker))) {
      throw new Error(`workspace cognition leaked into another workspace: ${JSON.stringify(otherRecalled).slice(0, 400)}`)
    }
    await tools.get('cognition_forget').execute({ id: wsStored.stored.id }, wsExec)
    process.stdout.write(`verify-agent-team: cognition workspace isolation ok id=${wsStored.stored.id}\n`)
  }
  if (process.env.VERIFY_DOMAIN_WORKSPACE) {
    const exec = {
      agent: { id: 'verify-domain-kb', session: { header: { cwd: process.env.VERIFY_DOMAIN_WORKSPACE } } },
      signal: new AbortController().signal,
    }
    const search = parseToolResult(await tools.get('kb_search').execute({
      query: 'polyvinyl alcohol crystallinity orientation',
      domain: 'pva-optical-film',
      top_k: 5,
    }, exec))
    const hits = Array.isArray(search?.results) ? search.results : []
    if (hits.length === 0) throw new Error(`domain kb_search returned no hits: ${JSON.stringify(search).slice(0, 500)}`)
    if (!hits.every(hit => hit.domain === 'pva-optical-film')) {
      throw new Error(`domain kb_search leaked another domain: ${JSON.stringify(hits.map(hit => hit.domain))}`)
    }
    const cross = parseToolResult(await tools.get('kb_search').execute({
      query: 'GIWAXS grazing incidence scattering',
      domain: 'pva-optical-film',
      crossDomain: true,
      top_k: 5,
    }, exec))
    const crossHits = Array.isArray(cross?.results) ? cross.results : []
    if (!crossHits.some(hit => hit.domain === 'waxs-methods')) {
      throw new Error(`crossDomain search did not reach related waxs-methods: ${JSON.stringify(crossHits.map(hit => hit.domain))}`)
    }
    process.stdout.write(
      `verify-agent-team: domain KB isolation ok hits=${hits.length} crossHits=${crossHits.length}\n`,
    )
  }
  if (process.env.VERIFY_ZOTERO_DB) {
    const zotero = tools.get('kb_zotero')
    if (zotero === undefined) throw new Error('kb_zotero did not register')
    const args = {
      zotero_db: process.env.VERIFY_ZOTERO_DB,
      ...(process.env.VERIFY_KB_ROOT === undefined ? {} : { kb_root: process.env.VERIFY_KB_ROOT }),
      limit: Number(process.env.VERIFY_ZOTERO_LIMIT ?? '3'),
      ...(process.env.VERIFY_ZOTERO_DRY === '1' ? { dry_run: true } : {}),
    }
    const result = parseToolResult(await zotero.execute(args, {
      agent: { id: 'verify-zotero' },
      signal: new AbortController().signal,
    }))
    const summary = {
      ok: result?.ok,
      status: result?.status,
      totals: result?.totals,
      candidates: result?.candidates,
      documents: result?.documents?.slice?.(0, 5) ?? result?.documents,
      files: result?.files?.slice?.(0, 5),
      errors: result?.errors?.slice?.(0, 3) ?? result?.errors,
      message: result?.message,
    }
    process.stdout.write(`verify-agent-team: kb_zotero ${JSON.stringify(summary).slice(0, 1500)}\n`)
    if (process.env.VERIFY_ZOTERO_DRY !== '1' && result?.ok === false) {
      throw new Error(`kb_zotero failed: ${JSON.stringify(result).slice(0, 600)}`)
    }
  }
  if (process.env.VERIFY_KB_ROOT) {
    const stats = parseToolResult(await tools.get('kb_stats').execute({
      kb_root: process.env.VERIFY_KB_ROOT,
    }, { agent: { id: 'verify-kb' }, signal: new AbortController().signal }))
    process.stdout.write(
      `verify-agent-team: kb_stats docs=${String(stats?.documents ?? stats?.docs ?? '?')} `
        + `chunks=${String(stats?.chunks ?? '?')} vectors=${String(stats?.vectors ?? '?')}\n`,
    )
  }
  if (process.env.VERIFY_INGEST_PATHS) {
    const paths = process.env.VERIFY_INGEST_PATHS.split('|').filter(Boolean)
    const ingested = parseToolResult(await tools.get('kb_ingest').execute({
      paths,
      ...(process.env.VERIFY_KB_ROOT === undefined ? {} : { kb_root: process.env.VERIFY_KB_ROOT }),
    }, { agent: { id: 'verify-kb' }, signal: new AbortController().signal }))
    process.stdout.write(
      `verify-agent-team: kb_ingest status=${String(ingested?.status)} `
        + `totals=${JSON.stringify(ingested?.totals)} job=${String(ingested?.job_id ?? '')}\n`,
    )
    if (ingested?.ok === false) throw new Error(`kb_ingest failed: ${JSON.stringify(ingested).slice(0, 600)}`)
  }
  if (process.env.VERIFY_KB_QUERY) {
    for (const query of process.env.VERIFY_KB_QUERY.split('|').filter(Boolean)) {
      const searched = parseToolResult(await tools.get('kb_search').execute({
        query,
        depth: 'quick',
        top_k: 3,
        ...(process.env.VERIFY_KB_MODE === undefined ? {} : { mode: process.env.VERIFY_KB_MODE }),
        ...(process.env.VERIFY_KB_ROOT === undefined ? {} : { kb_root: process.env.VERIFY_KB_ROOT }),
      }, { agent: { id: 'verify-kb' }, signal: new AbortController().signal }))
      const hits = Array.isArray(searched?.results) ? searched.results : []
      process.stdout.write(
        `verify-agent-team: kb_search q=${query} mode=${process.env.VERIFY_KB_MODE ?? 'default'} `
          + `engineMode=${String(searched?.mode ?? searched?.mode_used ?? '?')} hits=${hits.length} `
          + `note=${JSON.stringify(String(searched?.note ?? '').slice(0, 180))} `
          + `titles=${JSON.stringify(hits.slice(0, 3).map(hit => hit.title ?? hit.file ?? hit.source)).slice(0, 900)}\n`,
      )
      if (hits.length === 0) throw new Error(`kb_search returned no hits for ${query}`)
    }
  }
  if (process.env.VERIFY_NEW_TOOLS === '1') {
    const exec = {
      agent: { id: 'verify-new-tools', session: { header: { cwd: WORKSPACE } } },
      signal: new AbortController().signal,
    }
    const lit = parseToolResult(await tools.get('lit_search').execute({
      query: 'polyvinyl alcohol crystallinity stretching',
      sources: ['openalex'],
      max: 3,
    }, exec))
    process.stdout.write(
      `verify-agent-team: lit_search ok=${String(lit?.ok)} papers=${Array.isArray(lit?.papers) ? lit.papers.length : '?'} `
        + `errors=${JSON.stringify(lit?.errors ?? []).slice(0, 500)}\n`,
    )
    if (lit?.ok !== true) {
      process.stdout.write('verify-agent-team: warning: lit_search needs network access; registration is verified\\n')
    }
    if (process.env.VERIFY_DOC_PDF) {
      const route = parseToolResult(await tools.get('doc_route').execute({
        path: process.env.VERIFY_DOC_PDF,
      }, exec))
      if (typeof route?.format !== 'string' || route.format === 'unknown') {
        throw new Error(`doc_route failed: ${JSON.stringify(route).slice(0, 600)}`)
      }
      process.stdout.write(
        `verify-agent-team: doc_route format=${route.format} pages=${String(route.pages ?? '?')} `
          + `columns=${String(route.column_estimate ?? route.columns ?? '?')}\n`,
      )
      const markdown = parseToolResult(await tools.get('pdf_markdown').execute({
        path: process.env.VERIFY_DOC_PDF,
        pages: '1',
      }, exec))
      if (typeof markdown?.markdown !== 'string' || markdown.markdown.length < 100) {
        throw new Error(`pdf_markdown returned no usable page: ${JSON.stringify(markdown).slice(0, 600)}`)
      }
      process.stdout.write(
        `verify-agent-team: pdf_markdown chars=${markdown.markdown.length} pagesUsed=${String(markdown.pagesUsed)}\n`,
      )
    }
    if (process.env.VERIFY_ZOTERO_LOCAL === '1') {
      const search = parseToolResult(await tools.get('zotero_search').execute({
        query: process.env.VERIFY_ZOTERO_QUERY ?? 'polyvinyl',
        limit: 3,
        mode: 'compact',
      }, exec))
      const items = Array.isArray(search?.items) ? search.items : []
      if (items.length === 0) {
        throw new Error(`zotero_search returned no items: ${JSON.stringify(search).slice(0, 600)}`)
      }
      const key = String(items[0].key ?? items[0].itemKey ?? '')
      if (key === '') throw new Error(`zotero_search rows carry no key: ${JSON.stringify(items[0]).slice(0, 400)}`)
      const item = parseToolResult(await tools.get('zotero_item').execute({ key }, exec))
      const title = String(item?.item?.title ?? item?.item?.data?.title ?? '')
      const fulltext = parseToolResult(await tools.get('zotero_fulltext').execute({ itemKey: key }, exec))
      process.stdout.write(
        `verify-agent-team: zotero_search count=${String(search.count ?? items.length)} key=${key} `
          + `title=${JSON.stringify(title).slice(0, 160)} fulltextChars=${String(fulltext?.text?.length ?? 0)} `
          + `mode=${String(fulltext?.mode ?? '?')}\n`,
      )
      if (typeof fulltext?.text !== 'string' || fulltext.text.length < 100) {
        throw new Error(`zotero_fulltext returned no text: ${JSON.stringify(fulltext).slice(0, 600)}`)
      }
    }
  }
  const delegateDescription = String(delegate.description ?? '')
  for (const name of ['physicist', 'characterization', 'modeler', 'literature', 'reviewer']) {
    if (!delegateDescription.includes(name)) {
      throw new Error(`delegate_agent catalog does not list ${name}: ${delegateDescription.slice(0, 500)}`)
    }
  }

  const agents = ctx.get('agents')
  const sessions = ctx.get('sessionController')
  if (agents === undefined || sessions === undefined) throw new Error('agent services missing')
  const children = new Map()

  for (const row of MATRIX) {
    const created = await sessions.create({ cwd: WORKSPACE, agentPreset: row.caller })
    if (created.agentPreset !== row.caller) {
      throw new Error(`caller preset for ${row.caller} resolved to ${String(created.agentPreset)}`)
    }
    const caller = agents.get(created.sessionId)
    if (caller === undefined) throw new Error(`no live caller agent for ${row.caller}`)
    const childId = await delegate.execute(
      { agent: row.target, prompt: 'Smoke child: reply with exactly READY and call no tools.' },
      { agent: caller, signal: new AbortController().signal },
    )
    let child
    const deadline = Date.now() + 10_000
    while (child === undefined && Date.now() < deadline) {
      child = agents.get(childId)
      if (child === undefined) await delay(50)
    }
    if (child === undefined) throw new Error(`child ${childId} for ${row.target} never appeared`)
    const header = child.session.header
    if (header.agentPreset !== row.childPreset) {
      throw new Error(
        `${row.caller} -> ${row.target}: child preset ${String(header.agentPreset)} != ${row.childPreset}`,
      )
    }
    const childTools = (tools.schemas(child) ?? []).map(tool => tool.name)
    if (childTools.length === 0) throw new Error(`${row.target} child exposed no tools`)
    children.set(row.target, { child, tools: new Set(childTools) })
    process.stdout.write(
      `verify-agent-team: ${row.caller} -> ${row.target} preset=${header.agentPreset} tools=${childTools.length}\n`,
    )
    child.cancel({ kind: 'user' })
  }

  const requireTool = (target, names) => {
    const entry = children.get(target)
    if (entry === undefined) throw new Error(`no ${target} child surfaced`)
    for (const name of names) {
      if (!entry.tools.has(name)) throw new Error(`${target} is missing whitelisted tool ${name}`)
    }
  }
  const forbidTool = (target, names) => {
    const entry = children.get(target)
    if (entry === undefined) throw new Error(`no ${target} child surfaced`)
    for (const name of names) {
      if (entry.tools.has(name)) throw new Error(`${target} unexpectedly advertises ${name}`)
    }
  }
  const expectDenied = async (target, name) => {
    const entry = children.get(target)
    if (entry === undefined) throw new Error(`no ${target} child surfaced`)
    const outcome = await tools.execute({
      callId: randomUUID(),
      name,
      arguments: {},
      agent: entry.child,
      signal: new AbortController().signal,
    })
    if (!outcome.isError) {
      throw new Error(`${target} executed forbidden tool ${name}`)
    }
    return String(outcome.error?.message ?? outcome.error?.code ?? 'denied')
  }
  requireTool('literature', ['kb_search', 'kb_rag', 'pm_kb_note', 'zotero_search', 'lit_search', 'doc_route', 'domain_route', 'domain_scope', 'domain_recall', 'domain_remember'])
  forbidTool('literature', ['pm_sim_flory_huggins', 'pm_sim_md_run', 'delegate_agent', 'write', 'zotero_note', 'zotero_highlight', 'cognition_context', 'cognition_recall', 'cognition_remember'])
  requireTool('reviewer', ['pm_gate_check', 'pm_evidence_verify', 'kb_search', 'ask_advisor', 'domain_route', 'domain_scope', 'domain_recall'])
  forbidTool('reviewer', ['write', 'pm_hypothesis_transition', 'delegate_agent', 'pm_sim_md_run', 'zotero_note', 'domain_remember', 'cognition_context', 'cognition_recall', 'cognition_remember'])
  requireTool('characterization', ['pm_waxs_pro', 'pm_evidence_record', 'pyenv_discover', 'domain_route', 'domain_remember'])
  forbidTool('characterization', ['pm_sim_md_run', 'delegate_agent', 'cognition_context', 'cognition_recall', 'cognition_remember'])
  requireTool('physicist', ['pm_hypothesis_propose', 'pm_sim_flory_huggins', 'domain_route', 'domain_remember'])
  forbidTool('physicist', ['delegate_agent', 'write', 'cognition_context', 'cognition_recall', 'cognition_remember'])
  requireTool('modeler', ['pm_sim_flory_huggins', 'pm_sim_md_run', 'pyenv_create', 'domain_route', 'domain_remember'])
  forbidTool('modeler', ['delegate_agent', 'cognition_context', 'cognition_recall', 'cognition_remember'])
  const forbidden = [
    await expectDenied('literature', 'pm_sim_flory_huggins'),
    await expectDenied('reviewer', 'pm_hypothesis_transition'),
    await expectDenied('literature', 'delegate_agent'),
  ]
  process.stdout.write(`verify-agent-team: forbidden calls denied (${forbidden.length})\n`)

  // --- one real chain: project -> note/KB -> WAXS -> hypothesis -> gate -> report
  const scientistSession = await sessions.create({ cwd: WORKSPACE, agentPreset: 'polymer-scientist' })
  const scientist = agents.get(scientistSession.sessionId)
  if (scientist === undefined) throw new Error('no live scientist agent')
  process.stdout.write(`verify-agent-team: scientist session tools ${tools.schemas(scientist).length}\n`)
  const call = async (agent, name, args) => {
    const tool = agent.ctx.tools.get(name)
    if (tool === undefined) throw new Error(`${name} is not visible to the acting expert`)
    const raw = await tool.execute(args, { agent, signal: new AbortController().signal })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed
  }
  const project = await call(scientist, 'pm_project_create', {
    title: 'Agent team 验收',
    question: 'PVA 热定型是否提高结晶度并改变取向',
    domain: 'pva-optical-film',
  })
  if (process.env.VERIFY_PYENV === '1') {
    const found = await call(scientist, 'pyenv_discover', {})
    if (!Array.isArray(found?.venvs) || !Array.isArray(found?.scanned)) {
      throw new Error(`pyenv_discover returned an unexpected shape: ${JSON.stringify(found).slice(0, 500)}`)
    }
    process.stdout.write(
      `verify-agent-team: pyenv_discover scanned=${found.scanned.length} venvs=${found.venvs.length}\n`,
    )
  }
  const projectId = project?.data?.project?.id
  if (typeof projectId !== 'string') throw new Error(`pm_project_create failed: ${JSON.stringify(project)}`)

  const literature = children.get('literature')?.child
  const characterization = children.get('characterization')?.child
  const physicist = children.get('physicist')?.child
  const reviewer = children.get('reviewer')?.child
  if (!literature || !characterization || !physicist || !reviewer) throw new Error('missing chain child')

  const note = await call(literature, 'pm_kb_note', {
    text: 'CHAINMARKER 热定型 120 C、30 min 的 PVA 薄膜结晶度约 28.8%，由 WAXS 峰面积比得到。',
    title: 'agent-team chain note',
    tags: ['agent-team'],
  })
  if (note?.data?.kbIngest?.ok !== true) throw new Error(`pm_kb_note ingest failed: ${JSON.stringify(note)}`)
  const hits = await call(literature, 'kb_search', { query: 'CHAINMARKER PVA crystallinity', top_k: 3 })
  if (!JSON.stringify(hits).includes('CHAINMARKER')) throw new Error(`kb_search missed the chain note: ${JSON.stringify(hits)}`)

  const lines = ['twotheta_deg,intensity']
  for (let i = 0; i < 200; i += 1) {
    const x = 9 + (19 * i) / 199
    const gauss = (area, center, width) =>
      (area / (width * Math.sqrt(Math.PI / 2))) * Math.exp(-2 * ((x - center) / width) ** 2)
    const value = gauss(500, 11.6, 0.5) + gauss(2000, 19.5, 0.7) + gauss(600, 22.9, 0.8) + gauss(2600, 20.3, 3.5) + 30
    lines.push(`${x.toFixed(4)},${value.toFixed(4)}`)
  }
  writeFileSync(join(WORKSPACE, 'pva_fit.csv'), `${lines.join('\n')}\n`)
  const waxs = await call(characterization, 'pm_waxs_pro', {
    projectId,
    op: 'peakfit',
    dataPath: 'pva_fit.csv',
    peaks: [
      { center: 11.6, width: 0.5, role: 'crystalline' },
      { center: 19.5, width: 0.7, role: 'crystalline' },
      { center: 22.9, width: 0.8, role: 'crystalline' },
      { center: 20.3, width: 3.5, role: 'amorphous' },
    ],
    fitRange: [9, 28],
    claimSupport: '热定型提高 PVA 结晶度',
    strength: 'moderate',
  })
  if (waxs?.ok !== true) throw new Error(`pm_waxs_pro failed: ${JSON.stringify(waxs)}`)
  const evidenceId = waxs.data?.evidence?.id
  if (typeof evidenceId !== 'string') throw new Error(`pm_waxs_pro returned no evidence id: ${JSON.stringify(waxs)}`)

  const hypothesis = await call(physicist, 'pm_hypothesis_propose', {
    projectId,
    statement: '热定型通过增加晶区体积分数提高 PVA 薄膜结晶度',
    competitors: ['热定型只改变取向而不改变结晶度'],
    evidenceIds: [evidenceId],
  })
  if (hypothesis?.ok !== true) throw new Error(`pm_hypothesis_propose failed: ${JSON.stringify(hypothesis)}`)

  const gate = await call(reviewer, 'pm_gate_check', {
    projectId,
    kind: 'claim',
    claim: '热定型提高 PVA 结晶度',
    evidenceIds: [evidenceId],
  })
  if (gate?.ok !== true) throw new Error(`pm_gate_check failed: ${JSON.stringify(gate)}`)

  const report = await call(scientist, 'pm_analysis_report', {
    payload: {
      title: 'Agent team 链路验收',
      subtitle: 'KB -> WAXS -> hypothesis -> gate',
      kpis: [{ label: '结晶度', value: String(waxs.data.analysis.crystallinityIndex), unit: '', note: 'WAXS peakfit' }],
      sections: [{ heading: '证据', narrative: `evidence ${evidenceId}; gate ${gate.data?.verdict ?? 'unknown'}` }],
      conclusions: ['链路每步均返回真实工具结果。'],
    },
    outputDir: 'reports',
    name: 'agent-team-chain',
  })
  if (report?.ok !== true) throw new Error(`pm_analysis_report failed: ${JSON.stringify(report)}`)

  process.stdout.write(
    'verify-agent-team: six-preset delegation matrix, expert tool isolation and real chain passed\n',
  )
} catch (cause) {
  process.stderr.write(`verify-agent-team: FAILED: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
  process.exitCode = 1
} finally {
  await Promise.race([
    ctx?.fiber.dispose(),
    delay(10_000).then(() => process.stdout.write('verify-agent-team: warning: host dispose timed out\n')),
  ])
  releasePackageResolver?.()
  pnpmRuntime?.dispose()
  try {
    rmSync(HOME, { recursive: true, force: true })
  } catch (cleanupCause) {
    process.stdout.write(`verify-agent-team: warning: temp home cleanup failed: ${cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)}\n`)
  }
}
