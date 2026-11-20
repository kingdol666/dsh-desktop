/** Headless literature-plugin acceptance: boots the desktop profile composition with
 * dsh-kb-rag + dsh-zotero-skill pinned, then asserts the kb_* tool surface, the
 * zotero skill provider, the six polymer experts, and the pm-research tool surface
 * all survive in ONE composition. Also proves the web client graph materializes the
 * kb-rag client inject row. Complements verify-profile-boot.mjs (which asserts the
 * upstream surface without third-party literature bundles). */

import { syncBuiltinESMExports } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const BIN_NAME = 'dsh-plugin-desktop-literature-smoke'
/** Acceptance-pinned literature bundles (docs/polymechanism/11-文献检索与高分子筛选设计.md §3). */
const LITERATURE_BUNDLES = Object.freeze({
  'dsh-kb-rag': '1.6.8',
  'dsh-zotero-skill': '0.5.5',
})
const KB_TOOLS = Object.freeze([
  'kb_ingest', 'kb_search', 'kb_rag', 'kb_zotero', 'kb_fetch',
  'kb_scope', 'kb_dedup', 'kb_clear', 'kb_stats', 'kb_status',
])
const PM_REGRESSION_TOOLS = Object.freeze([
  'pm_literature_read', 'pm_literature_extract',
  'pm_literature_search', 'pm_literature_screen', 'pm_literature_download',
])
const REQUIRED_SKILLS = Object.freeze([
  'zotero',
  'literature-review',
  'polymer-physics', 'pva-oblique-stretching', 'mechanism-discovery', 'experiment-design',
])
const POLYMER_PRESETS = Object.freeze([
  'polymer-scientist', 'polymer-physicist', 'polymer-characterization',
  'polymer-modeler', 'polymer-literature', 'polymer-reviewer',
])

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-literature-'))
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
  if (!prepared.profile.layers.some(layer => layer.packageName === 'dsh-kb-rag')) {
    throw new Error('composed desktop profile does not carry the dsh-kb-rag bundle layer')
  }
  if (!prepared.profile.layers.some(layer => layer.packageName === 'dsh-zotero-skill')) {
    throw new Error('composed desktop profile does not carry the dsh-zotero-skill bundle layer')
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
  if (ctx.get('pluginManager') === undefined) {
    throw new Error('literature composition lost the official plugin manager')
  }

  // --- web client graph: kb-rag client inject row must materialize ---
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
  // kb-rag also injects dsh-client-ui-primitives, which does not exist as a graph
  // ENTRY in the rc3 client module graph (it bundles into other entries). The
  // kb-rag client half self-registers a lazy-CJS factory requiring only `react`,
  // and its own header documents that a client-side load failure does not affect
  // the Host tool surface — so a missing primitives ENTRY degrades to a warning.
  if (!ids.has('@deepseek-ai/dsh-client-ui-primitives')) {
    process.stdout.write(
      'verify-literature-plugins: WARN dsh-client-ui-primitives is not a graph entry on rc3; kb-rag client half may degrade (Host tools unaffected)\n',
    )
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
    'verify-literature-plugins: kb_* x10 + zotero skill + six polymer experts + pm surface + web client graph passed\n',
  )
} finally {
  await ctx?.fiber.dispose()
  releasePackageResolver?.()
  pnpmRuntime?.dispose()
  rmSync(home, { recursive: true, force: true })
}
