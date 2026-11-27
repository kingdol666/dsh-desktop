/** Headless functional acceptance for the replaced research stack: boots the
 * desktop profile composition with the partitioned knowledge base, literature
 * library, cognition memory and Zotero pinned, then calls the real tools —
 * kb_ingest/kb_search/kb_rag plus pm_kb_note, cognition_remember/recall,
 * tag partitions, and lit_init/lit_import/lit_find across two project zones.
 * Proves the partitions do not leak and the tools write where they claim. */

import { syncBuiltinESMExports } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
import { prepareDesktopProfile } from '../lib/profile.js'
import { DesktopProfileService } from '../lib/profile-service.js'
import { createDesktopProfileBoot } from '../lib/profile-context.js'

const BIN_NAME = 'dsh-plugin-desktop-research-tools-smoke'
/** Acceptance-pinned research bundles (paper KB + literature library + memory). */
const LITERATURE_BUNDLES = Object.freeze({
  'dsh-zotero-skill': '0.5.5',
  'dsh-kb-rag': '1.6.8',
  'dsh-lit-library': '0.2.1',
  'dsh-cognition-engine': '0.14.0',
})
const KB_TOOLS = Object.freeze([
  'kb_ingest', 'kb_search', 'kb_rag', 'kb_stats', 'kb_fetch',
  'pm_kb_note',
  'lit_init', 'lit_import', 'lit_find', 'lit_check',
  'cognition_context', 'cognition_remember', 'cognition_recall',
])
const PM_REGRESSION_TOOLS = Object.freeze([
  'pm_literature_read', 'pm_literature_extract',
  'pm_literature_search', 'pm_literature_screen', 'pm_literature_download',
  'pm_mechanism_screen',
])
const REQUIRED_SKILLS = Object.freeze([
  'zotero',
  'lit-library',
  'literature-review',
  'kb-grounded-answer',
  'polymer-physics', 'pva-oblique-stretching', 'mechanism-discovery', 'experiment-design',
])
const POLYMER_PRESETS = Object.freeze([
  'polymer-scientist', 'polymer-physicist', 'polymer-characterization',
  'polymer-modeler', 'polymer-literature', 'polymer-reviewer',
])

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-research-tools-'))
// The knowledge-base plugin resolves its SQLite file from DSH_HOME at apply
// time; pin it to the isolated smoke home so this test never touches the
// operator's real knowledge base.
process.env.DSH_HOME = home
// The literature tools derive their project root from the session cwd. Start the
// boot inside an isolated workspace so lit_* writes stay under the smoke home.
const workspace = join(home, 'research-workspace')
mkdirSync(workspace, { recursive: true })
mkdirSync(join(workspace, 'domains', 'test'), { recursive: true })
writeFileSync(join(workspace, 'domains', 'test', 'domain.json'), JSON.stringify({
  id: 'test',
  name: 'Verification domain',
  kbRoot: '.kb',
  allowedKinds: ['pdf', 'txt', 'md'],
  defaultKind: 'all',
  relatedDomains: [],
}), 'utf8')
mkdirSync(join(workspace, '.pm-domain'), { recursive: true })
writeFileSync(join(workspace, '.pm-domain', 'state.json'), JSON.stringify({
  schemaVersion: 1,
  domain: 'test',
  updatedAt: new Date().toISOString(),
}), 'utf8')
process.chdir(workspace)
// AA 2.0.3+ reads `os.userInfo().homedir`; redirect like verify-profile-boot.mjs so
// the smoke never touches the operator's real home or a running Desktop instance.
const realUserInfo = os.userInfo.bind(os)
os.userInfo = options => ({ ...realUserInfo(options), homedir: home })
os.homedir = () => home
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

let ctx
let releasePackageResolver
let pnpmRuntime
let mountedSpec
let nativeThemeSource = 'system'
const trayItems = []

try {
  const preparedFirst = prepareDesktopProfile('1', home, process.platform)
  // Re-state the manifest with the pinned literature bundles, then install from the
  // shared pnpm store (hard links; no network for store hits).
  writeFileSync(join(preparedFirst.profile.dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { ...LITERATURE_BUNDLES },
    dsh: { profile: { bundles: [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dsh-community-market',
      ...Object.keys(LITERATURE_BUNDLES),
    ] } },
  }))
  const packageRoot = new URL('../', import.meta.url)
  const pnpmBinPath = fileURLToPath(new URL('node_modules/pnpm/bin/pnpm.mjs', packageRoot))
  execFileSync(process.execPath, [pnpmBinPath, 'install', '--ignore-scripts', '--prefer-offline'], {
    cwd: preparedFirst.profile.dir,
    stdio: 'inherit',
  })
  const prepared = prepareDesktopProfile('1', home, process.platform)
  for (const bundle of Object.keys(LITERATURE_BUNDLES)) {
    if (!prepared.profile.layers.some(layer => layer.packageName === bundle)) {
      throw new Error(`composed desktop profile does not carry the ${bundle} bundle layer`)
    }
  }
  const electronVersion = JSON.parse(
    readFileSync(new URL('node_modules/electron/package.json', packageRoot), 'utf8'),
  ).version
  pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    stateDir: join(home, 'runtime-commands'),
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
      statePath: join(home, 'update-state.json'),
      request: async () => { throw new Error('literature smoke must not perform update requests') },
      confirmDownload: async () => false,
      showManualCheckResult: async () => {},
      downloadAndOpen: async () => {},
      notify: () => {},
    },
    schedule(spec) {
      mountedSpec = spec
      return async () => {}
    },
    async mountScheduled() {
      if (mountedSpec === undefined) throw new Error('desktop shell was not registered')
      runtime.setLocalePreference(mountedSpec.readLocalePreference())
      nativeThemeSource = mountedSpec.readThemeSource()
    },
    show() {},
    registerTrayItem(item) {
      trayItems.push(item)
      return {
        refresh() {},
        dispose() {
          const index = trayItems.indexOf(item)
          if (index >= 0) trayItems.splice(index, 1)
        },
      }
    },
    openTerminal() {},
    setLocalePreference(preference) { runtime.locale = preference ?? 'en' },
    setThemeSource(source) { nativeThemeSource = source },
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
        current: {
          name: 'desktop',
          dir: prepared.profile.dir,
        },
        list: () => [{
          name: 'desktop',
          dir: prepared.profile.profilePath ? prepared.profile.dir : prepared.profile.dir,
          exists: true,
          bundles: prepared.profile.layers.map(layer => layer.packageName),
          webCapable: true,
        }],
        persistSelection: () => {},
        requestRestart: () => {},
      })
      provideCmdline(host, {
        args: ['--host', '127.0.0.1', '--port', '0'],
        exit: () => {},
      },
      )
    },
    prepared.bareModuleBaseUrl,
  )
  profileBoot.markReady()
  await runtime.mountScheduled()

  // --- tool surface: kb_* registered alongside the pm-research surface ---
  const tools = ctx.get('tools')
  if (tools === undefined) throw new Error('assembled desktop profile is missing the tool registry')
  for (const name of KB_TOOLS) {
    if (tools.get(name) === undefined) {
      throw new Error(`literature bundle tool ${name} did not register (bundle skipped or failed to apply)`)
    }
  }
  for (const name of PM_REGRESSION_TOOLS) {
    if (tools.get(name) === undefined) {
      throw new Error(`pm-research regression tool ${name} disappeared after adding literature bundles`)
    }
  }

  // --- skill surface: zotero skill provider + polymer methodology skills ---
  const skills = ctx.get('skills')
  if (skills === undefined) throw new Error('assembled desktop profile is missing the skill registry')
  const skillsDeadline = Date.now() + 15_000
  let skillNames = []
  while (Date.now() < skillsDeadline) {
    const rawSnapshot = skills.snapshot !== undefined ? await skills.snapshot() : await skills.list()
    skillNames = (Array.isArray(rawSnapshot) ? rawSnapshot : rawSnapshot.skills).map(skill => skill.name)
    if (REQUIRED_SKILLS.every(name => skillNames.includes(name))) break
    await delay(100)
  }
  for (const name of REQUIRED_SKILLS) {
    if (!skillNames.includes(name)) {
      throw new Error(`assembled desktop profile is missing the ${name} skill (got: ${skillNames.join(', ')})`)
    }
  }

  // --- expert presets: six polymer experts still selectable ---
  const agentPresets = ctx.get('agentPresets')
  if (agentPresets === undefined) throw new Error('assembled desktop profile is missing the agent preset roster')
  const presetIds = (await agentPresets.list()).map(preset => preset.id)
  for (const preset of POLYMER_PRESETS) {
    if (!presetIds.includes(preset)) {
      throw new Error(`assembled desktop profile is missing the ${preset} expert preset`)
    }
  }

  // --- real tool calls: paper knowledge base + manual note -------------------
  const waxsSource = join(workspace, 'pva-waxs.txt')
  const ftirSource = join(workspace, 'pva-ftir.txt')
  writeFileSync(waxsSource, [
    '# WAXSONLY',
    'WAXSONLY marker. Polyvinyl alcohol films were annealed at 120 C for 30 minutes before wide-angle X-ray scattering.',
    'The measured crystallinity was 28.8 percent from the integrated area of the crystalline reflection after background subtraction.',
    'Each sample was measured at room temperature, and the same batch was used for the FTIR oxidation series.',
    'The diffraction patterns were corrected for air scattering and detector dark current before peak fitting.',
    'This synthetic note exists only for the dsh-kb-rag ingestion smoke test and must not be cited as data.',
    '',
  ].join('\n\n'))
  writeFileSync(ftirSource, [
    '# FTIRONLY',
    'FTIRONLY marker. Fourier-transform infrared spectra monitored oxidation of the same polyvinyl alcohol film.',
    'The carbonyl index was 0.42 after accelerated ultraviolet exposure, normalized against the 2910 cm-1 reference band.',
    'Peak heights were read from baseline-corrected absorbance spectra with a fixed integration window.',
    'Three coupons were measured per condition to estimate the repeatability of the index.',
    'This synthetic note exists only for the dsh-kb-rag ingestion smoke test and must not be cited as data.',
    '',
  ].join('\n\n'))
  const callTool = async (name, args) => {
    const definition = tools.get(name)
    if (definition === undefined) throw new Error(`tool ${name} disappeared before execution`)
    const result = await definition.execute(args, { agent: { id: 'verify-research-agent' } })
    if (typeof result !== 'string') return result
    try {
      return JSON.parse(result)
    } catch {
      return result
    }
  }
  const ingested = await callTool('kb_ingest', { paths: [waxsSource, ftirSource] })
  process.stdout.write(`verify-research-tools: kb_ingest ${JSON.stringify(ingested)}\n`)
  const added = Number(ingested?.totals?.added ?? ingested?.added ?? 0)
  const updated = Number(ingested?.totals?.updated ?? ingested?.updated ?? 0)
  if (!(added + updated >= 2)) {
    throw new Error(`kb_ingest did not add both documents: ${JSON.stringify(ingested)}`)
  }
  const waxsHits = await callTool('kb_search', { query: 'WAXSONLY', top_k: 5 })
  const waxsResults = Array.isArray(waxsHits.results) ? waxsHits.results : []
  if (waxsResults.length < 1 || !JSON.stringify(waxsResults).includes('WAXSONLY')) {
    throw new Error(`kb_search missed the WAXS document: ${JSON.stringify(waxsHits)}`)
  }
  if (JSON.stringify(waxsResults).includes('FTIRONLY')) {
    throw new Error(`kb_search leaked the FTIR document into the WAXS hit set: ${JSON.stringify(waxsResults)}`)
  }
  const ftirHits = await callTool('kb_search', { query: 'FTIRONLY', top_k: 5 })
  if (!(Array.isArray(ftirHits.results) && JSON.stringify(ftirHits.results).includes('FTIRONLY'))) {
    throw new Error(`kb_search missed the FTIR document: ${JSON.stringify(ftirHits)}`)
  }
  const note = await callTool('pm_kb_note', {
    text: [
      'NOTEONLY 手动入库：PVA 结晶度 28.8%。',
      '热定型 120 C、30 min；WAXS 子午向积分扣除空气散射与暗电流后取结晶峰面积。',
      '该条由用户手动要求存入知识库，供后续回答引用；不是论文原文。',
    ].join('\n\n'),
    title: '验收笔记',
    tags: ['verify'],
    preset: 'polymer-scientist',
    actor: 'verify-research-agent',
  })
  if (!note?.data?.path || note?.data?.kbIngest?.ok === false) {
    throw new Error(`pm_kb_note did not store and ingest the note: ${JSON.stringify(note)}`)
  }
  const noteHits = await callTool('kb_search', { query: 'NOTEONLY', top_k: 5 })
  if (!(Array.isArray(noteHits.results) && JSON.stringify(noteHits.results).includes('NOTEONLY'))) {
    throw new Error(`kb_search missed the manual note: ${JSON.stringify(noteHits)}`)
  }
  const rag = await callTool('kb_rag', { query: 'WAXSONLY crystallinity', top_k: 3 })
  if (!(Array.isArray(rag.evidence) && rag.evidence.length >= 1)) {
    throw new Error(`kb_rag returned no evidence: ${JSON.stringify(rag)}`)
  }
  if (process.env.VERIFY_RESEARCH_NETWORK === '1') {
    const download = await callTool('pm_literature_download', {
      doi: '10.1039/c7sc03334f',
      preset: 'polymer-scientist',
      actor: 'verify-research-agent',
    })
    if (download?.data?.status !== 'DOWNLOADED') {
      throw new Error(`network download did not reach DOWNLOADED: ${JSON.stringify(download)}`)
    }
    if (download?.data?.kbIngest?.ok !== true) {
      throw new Error(`downloaded paper did not auto-ingest: ${JSON.stringify(download)}`)
    }
    process.stdout.write(`verify-research-tools: download ${download.data.status} kbIngest=${JSON.stringify(download.data.kbIngest)}\n`)
  }

  // --- real tool calls: memory tag partitions ------------------------------
  const prefMemory = await callTool('cognition_remember', {
    text: '报告必须标注单位与不确定度', tags: ['pref', 'verify'], scope: 'global',
  })
  const projectMemory = await callTool('cognition_remember', {
    text: 'PVA-WAXS 分区：热定型 120C 时 PVA 结晶度 28.8%', tags: ['proj:pva', 'waxs'], scope: 'global',
  })
  if (prefMemory?.stored?.id === undefined || projectMemory?.stored?.id === undefined) {
    throw new Error(`cognition_remember did not return stored ids: ${JSON.stringify({ prefMemory, projectMemory })}`)
  }
  const projectRecall = await callTool('cognition_recall', { query: '结晶度', tags: ['proj:pva'], limit: 5 })
  if (!(projectRecall.count >= 1) || !JSON.stringify(projectRecall).includes('PVA-WAXS')) {
    throw new Error(`cognition_recall missed the project tag partition: ${JSON.stringify(projectRecall)}`)
  }
  const foreignRecall = await callTool('cognition_recall', { query: '结晶度', tags: ['proj:ftir'], limit: 5 })
  if (foreignRecall.count !== 0) {
    throw new Error(`cognition_recall leaked across tag partitions: ${JSON.stringify(foreignRecall)}`)
  }
  const prefRecall = await callTool('cognition_recall', { query: '单位', tags: ['pref'], limit: 5 })
  if (!(prefRecall.count >= 1) || !JSON.stringify(prefRecall).includes('不确定度')) {
    throw new Error(`cognition_recall missed the preference partition: ${JSON.stringify(prefRecall)}`)
  }

  if (process.env.VERIFY_SIM === '1') {
    const project = await callTool('pm_project_create', {
      title: '验收仿真：PVA 共混相行为',
      question: 'PVA/PVP 共混体系在 420 K 下是否相容',
      domain: 'generic-polymer',
      preset: 'polymer-scientist',
      actor: 'verify-research-agent',
    })
    const projectId = project?.data?.project?.id
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error(`pm_project_create returned no project id: ${JSON.stringify(project)}`)
    }
    const sim = await callTool('pm_sim_flory_huggins', {
      projectId,
      n1: 1000,
      n2: 200,
      chiA: 0.02,
      chiB: 0.5,
      temperatureK: 420,
      preset: 'polymer-scientist',
      actor: 'verify-research-agent',
    })
    if (sim?.ok !== true || sim?.data?.simulation === undefined) {
      throw new Error(`pm_sim_flory_huggins failed: ${JSON.stringify(sim)}`)
    }
    process.stdout.write(`verify-research-tools: pm_sim_flory_huggins ${JSON.stringify(sim.data.simulation)}\n`)
  }

  // --- real tool calls: literature project zones ---------------------------
  const previousCwd = process.cwd()
  process.chdir(workspace)
  let indexWaxs = ''
  let indexOther = ''
  try {
    await callTool('lit_init', { project: 'pva-verify' })
    await callTool('lit_init', { project: 'other-project' })
    const paperPath = 'D:/pm-acceptance/pva-oblique-2026-11-20/data-wjh/papers/pva-nozzle-speed-2025.pdf'
    if (!existsSync(paperPath)) throw new Error(`acceptance paper disappeared: ${paperPath}`)
    const imported = await callTool('lit_import', {
      project: 'pva-verify', paths: [paperPath], tags: ['verify'], addTags: true, intent: 'explicit',
    })
    const waxsIndexPath = join(workspace, 'lit-projects', 'pva-verify', 'refs', '参考资料总表.md')
    const otherIndexPath = join(workspace, 'lit-projects', 'other-project', 'refs', '参考资料总表.md')
    if (!existsSync(waxsIndexPath)) {
      throw new Error(`lit_import did not create the project index: ${JSON.stringify(imported)}`)
    }
    indexWaxs = readFileSync(waxsIndexPath, 'utf8')
    indexOther = existsSync(otherIndexPath) ? readFileSync(otherIndexPath, 'utf8') : ''
    if (!indexWaxs.includes('pva-nozzle-speed-2025')) {
      throw new Error(`lit_import index lost the paper identity: ${indexWaxs.slice(0, 400)}`)
    }
    if (indexOther.includes('pva-nozzle-speed-2025')) {
      throw new Error('literature project zones leaked the imported paper into other-project')
    }
    const found = await callTool('lit_find', { project: 'pva-verify', tags: ['verify'] })
    if (!(found.count >= 1)) throw new Error(`lit_find missed the imported paper: ${JSON.stringify(found)}`)
  } finally {
    process.chdir(previousCwd)
  }
  if (ctx.get('pluginManager') === undefined) {
    throw new Error('literature composition lost the official plugin manager')
  }

  // --- web client graph: knowledge-base client inject row must materialize ---
  const expectedUrl = `http://127.0.0.1:${String(ctx.webServer.port)}/?dsh-desktop-mode=advanced&dsh-desktop-platform=win32&dsh-desktop-version=2.0.0&dsh-desktop-material=off`
  if (mountedSpec?.url !== expectedUrl) {
    throw new Error(`desktop plugin produced an unexpected renderer URL: ${String(mountedSpec?.url)}`)
  }
  const unauthenticated = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/`, {
    headers: {
      [BROWSER_ACCESS.rendererHeader.name]: BROWSER_ACCESS.rendererHeader.value,
    },
  })
  await unauthenticated.body?.cancel()
  if (unauthenticated.status !== 401) {
    throw new Error(`web root answered HTTP ${String(unauthenticated.status)} without a session cookie`)
  }
  const authenticationUrl = new URL(mountedSpec.authenticationUrl)
  const exchange = await fetch(authenticationUrl, {
    headers: {
      [BROWSER_ACCESS.rendererHeader.name]: BROWSER_ACCESS.rendererHeader.value,
    },
    redirect: 'manual',
  })
  await exchange.body?.cancel()
  if (exchange.status !== 303) {
    throw new Error(`browser authentication exchange returned HTTP ${String(exchange.status)}`)
  }
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
  if (cookie === undefined || cookie.length === 0) throw new Error('authentication exchange did not mint a cookie')
  const renderer = await fetch(expectedUrl, {
    headers: {
      [BROWSER_ACCESS.rendererHeader.name]: BROWSER_ACCESS.rendererHeader.value,
      Cookie: cookie,
    },
  })
  const html = await renderer.text()
  if (renderer.status !== 200) throw new Error(`web root returned HTTP ${String(renderer.status)} with a session`)
  const bootMatch = html.match(/(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\]) = (\{.*?\})<\/script>/u)
  if (bootMatch?.[1] === undefined) throw new Error('web root is missing window.__DSH_BOOT__')
  const graph = JSON.parse(bootMatch[1])
  const ids = new Set(graph.entries.map(entry => entry.id))
  for (const id of ['dsh-kb-rag', '@deepseek-ai/dsh-client-ui-conversation']) {
    if (!ids.has(id)) {
      throw new Error(`web client graph is missing ${id}; received ${[...ids].filter(candidate => candidate.includes('kb-rag') || candidate.includes('client-ui')).sort().join(', ') || '(no client-ui rows)'}`)
    }
  }

  // --- pm-research HTTP surface regression ---
  const pmHealth = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/pm/health`, {
    headers: { [BROWSER_ACCESS.rendererHeader.name]: BROWSER_ACCESS.rendererHeader.value },
  })
  if (!pmHealth.ok) throw new Error(`pm-research /pm/health answered ${String(pmHealth.status)} for the renderer`)
  const pmHealthPayload = await pmHealth.json()
  if (pmHealthPayload?.service !== 'pm-research' || pmHealthPayload?.ok !== true) {
    throw new Error(`pm-research /pm/health returned an unexpected payload: ${JSON.stringify(pmHealthPayload)}`)
  }
  const pmDenied = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/pm/health`)
  if (pmDenied.status !== 403) {
    throw new Error(`pm-research /pm/health answered ${String(pmDenied.status)} without a renderer token`)
  }

  // Workbench read surface: the client lists projects and reads one state.
  const projectsProbe = await fetch(`http://127.0.0.1:${String(ctx.webServer.port)}/pm/projects`, {
    headers: { [BROWSER_ACCESS.rendererHeader.name]: BROWSER_ACCESS.rendererHeader.value },
  })
  if (!projectsProbe.ok) {
    throw new Error(`pm-research /pm/projects answered ${String(projectsProbe.status)} for the renderer`)
  }
  const projectsPayload = await projectsProbe.json()
  if (projectsPayload?.ok !== true || !Array.isArray(projectsPayload?.data?.projects)) {
    throw new Error(`pm-research /pm/projects returned an unexpected payload: ${JSON.stringify(projectsPayload)}`)
  }

  process.stdout.write(
    'verify-research-tools: paper KB ingest/search/rag + manual note + memory tags + literature project isolation passed\n',
  )
} finally {
  await ctx?.fiber.dispose()
  releasePackageResolver?.()
  pnpmRuntime?.dispose()
  try {
    rmSync(home, { recursive: true, force: true })
  } catch (cleanupCause) {
    // A plugin-held handle may keep the temp profile open past disposal; never
    // let a leftover temp directory mask the smoke verdict.
    process.stdout.write(`verify-research-tools: warning: temp home cleanup failed: ${cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)}\n`)
  }
}
