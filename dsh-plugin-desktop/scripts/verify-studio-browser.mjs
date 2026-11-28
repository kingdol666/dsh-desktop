/** Exercise the Studio UI against the authenticated, composed Stable renderer. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Write a labeled renderer fixture through the normal stores, only in the temporary Profile. */
export async function seedStudioResearch(root) {
  const { ProjectStore, EvidenceLedger } = await import('../../packages/pm-core/lib/index.js')
  const project = {
    id: 'PR-1-f1a0', title: '界面验收：材料加工项目（测试）', question: '测试记录，仅用于核对来源和数据的呈现。',
    status: 'active', domain: 'generic-polymer', createdAt: '2026-11-28T00:00:00Z', linkedWorkspaces: [],
  }
  await ProjectStore.open(join(root, 'projects')).put(project)
  const ledger = await EvidenceLedger.open(join(root, 'projects', project.id, 'evidence.jsonl'))
  const { evidence } = await ledger.append({
    claimSupport: '界面验收用测试记录，不代表任何实验结果。', polarity: 'neutral', strength: 'weak',
    sourceRef: { type: 'file', ref: 'studio-test-fixture.csv' }, recordedBy: 'human:studio-smoke',
    recordedAt: project.createdAt,
  })
  return { project, evidence }
}

/** Open the existing profile fixture in Chromium; no prompts are submitted. */
export async function verifyDesktopStudioBrowser({ url, cookie, headers, fixture }) {
  const { chromium } = createRequire(new URL('../../dsh-desktop-next/package.json', import.meta.url))('playwright')
  const channel = process.env.DSH_NEXT_TEST_BROWSER_CHANNEL
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) })
  const target = new URL(url)
  const separator = cookie.indexOf('=')
  assert.ok(separator > 0)
  const screenshotDir = process.env.PM_STUDIO_SCREENSHOT_DIR
  try {
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }, locale: 'zh-CN', colorScheme: 'light',
      reducedMotion: 'reduce', extraHTTPHeaders: headers,
    })
    await context.addCookies([{ url: target.origin, name: cookie.slice(0, separator), value: cookie.slice(separator + 1) }])
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(target.href)
    const frame = page.locator('.dshDesktopFrame[data-desktop-mode="advanced"]')
    await frame.waitFor()
    await page.locator('body[data-pm-studio]').waitFor()
    const takeShot = async name => {
      if (screenshotDir) await page.screenshot({
        path: join(screenshotDir, `${name}.png`), animations: 'disabled',
        style: '[data-testid="pm-lit-workspace"] { visibility: hidden }',
      })
    }
    const withoutOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    const sidebar = frame.locator('[data-pane="sidebar"]')
    const research = sidebar.getByRole('button', { name: /^(研究工作台|Research desk)$/i })
    const literature = sidebar.getByRole('button', { name: /^(文献|Literature)$/i })
    const returnToChat = page.getByRole('button', { name: /返回(?:研究)?对话|回到对话|return to conversation|back to conversation/i })
    await research.waitFor()
    // Fresh profiles show the upstream preview notice. Acknowledge it through
    // the same UI as a user instead of modifying test storage or the renderer.
    const previewNotice = page.getByRole('dialog', { name: /预览版说明|Preview notice|Preview release/i })
    await previewNotice.getByRole('button', { name: /^(继续|Continue)$/i }).click()
    await previewNotice.waitFor({ state: 'detached' })
    // Account onboarding mounts after acknowledgement resolves, not in the
    // same render. An immediate isVisible() misses that second dialog.
    const accountDialog = page.getByRole('dialog', { name: /^(开始使用|Get started)$/i })
    await accountDialog.getByRole('button', { name: /^(关闭|Close)$/i }).click()
    await accountDialog.waitFor({ state: 'detached' })
    await research.click({ trial: true })
    await page.mouse.move(1370, 870)
    const compositor = page.locator('main [data-composer-card]').first()
    await compositor.waitFor()
    const rightbar = frame.locator('[data-sidebar-right-panel]')
    for (const panel of await rightbar.all()) {
      assert.equal(await panel.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)',
        'collapsed DockKit panel does not paint behind the conversation')
    }
    await takeShot('conversation-light')
    const dock = frame.locator('main .dshDesktopPmWbLauncher button')
    await dock.click()
    const workbenchDialog = page.locator('.dshDesktopPmWbDialog[open][role="dialog"][aria-modal="true"]')
    await workbenchDialog.getByRole('heading', { name: fixture.project.title, exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await workbenchDialog.waitFor({ state: 'hidden' })
    assert.equal(await dock.evaluate(button => document.activeElement === button), true, 'Escape restores the dock launcher focus')
    await research.click()
    const desk = frame.locator('main .dshDesktopPmWbDesk')
    await desk.getByRole('heading', { name: fixture.project.title, exact: true }).waitFor()
    assert.equal(await withoutOverflow(), true)
    await takeShot('research-desk-light')
    await desk.getByRole('button', { name: /^(数据与证据|Data (?:&|and) evidence)$/i }).click()
    await desk.getByText(fixture.evidence.claimSupport, { exact: true }).first().waitFor()
    await desk.getByText(fixture.evidence.sourceRef.ref, { exact: true }).waitFor()
    await takeShot('research-evidence-light')
    await literature.click()
    await page.getByTestId('pm-literature-page').getByRole('heading', { name: /^(文献|Literature)$/i }).waitFor()
    await page.getByTestId('pm-lit-workspace').locator('option').filter({ hasText: 'studio-smoke-workspace' }).waitFor({ state: 'attached' })
    assert.equal(await withoutOverflow(), true)
    await page.mouse.move(1100, 40)
    await takeShot('literature-light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.locator('body[data-pm-theme="dark"]').waitFor({ state: 'attached' })
    const newChat = sidebar.locator('button[class$="_newSession"]')
    assert.deepEqual(await newChat.evaluate(button => {
      const { backgroundColor, color } = getComputedStyle(button)
      return [backgroundColor, color]
    }), ['rgb(155, 183, 255)', 'rgb(18, 34, 64)'], 'dark new session uses the matched foreground and background')
    await takeShot('literature-dark')
    await sidebar.getByRole('button', { name: /^(插件|Plugins)$/i }).click()
    await frame.locator('[data-next-plugin-controls] [data-next-plugin-card]').first().waitFor()
    await takeShot('plugins-dark')
    await research.click()
    await desk.getByRole('heading', { name: fixture.project.title, exact: true }).waitFor()
    await page.setViewportSize({ width: 900, height: 680 })
    await frame.locator('[data-pane="sidebar"]').waitFor()
    await frame.and(page.locator('[data-sidebar-collapsed]')).waitFor()
    assert.equal(await withoutOverflow(), true)
    await takeShot('research-desk-dark-narrow')
    await returnToChat.click()
    await page.locator('[data-conversation-region]').first().waitFor()
    assert.deepEqual(errors, [], 'No renderer page errors')
    console.log('Studio renderer: research navigation, evidence records, literature, plugin controls, responsive geometry and light/dark verified')
  } finally {
    await browser.close()
  }
}
