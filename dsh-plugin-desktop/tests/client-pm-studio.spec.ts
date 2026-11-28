// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PmHeroBrandMark, PmSidebarBrandName } from '../src/client/pm-studio/brand.tsx'
import { PmHomeConsole, type PmHomeConsoleProps } from '../src/client/pm-studio/home-console.tsx'
import { applyEvidenceTab } from '../src/client/pm-studio/evidence-tab.ts'
import { applyPmStudio } from '../src/client/pm-studio/index.ts'
import { installPmStudioStyles } from '../src/client/pm-studio/styles.ts'

const PAYLOAD = {
  ok: true,
  data: {
    totals: { projects: 1, evidence: 42, hypotheses: 3, supported: 2, refuted: 0, pendingKnowledge: 7 },
    sim: { analytic: true, md: false },
  },
}

const LOCALE = { getSnapshot: () => 'zh', subscribe: () => () => {} }

function consoleProps(overrides: Partial<PmHomeConsoleProps> = {}): PmHomeConsoleProps {
  const useSessions = (selector: (state: unknown) => unknown) => selector({
    byId: { s1: { projectionValues: { agentPreset: 'polymer-scientist' } } },
  })
  return {
    session: { blank: true },
    sessionId: 's1',
    useSessions,
    locale: LOCALE,
    selectPreset: vi.fn(async () => {}),
    applyPrompt: vi.fn(() => true),
    ...overrides,
  } as unknown as PmHomeConsoleProps
}

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe('PolyMechanism brand occupants', () => {
  it('renders the product wordmark instead of the DeepSeek lockup', () => {
    const markup = renderToStaticMarkup(createElement(PmSidebarBrandName, { locale: LOCALE } as never))
    expect(markup).toContain('PolyMechanism')
    expect(markup).toContain('STUDIO')
    expect(markup).not.toContain('DeepSeek')
  })

  it('renders the material research heading and task guidance without a hard-coded project', () => {
    const markup = renderToStaticMarkup(createElement(PmHeroBrandMark, { size: 34, locale: LOCALE } as never))
    expect(markup).toContain('材料研究')
    expect(markup).toContain('检验机理')
    expect(markup).not.toContain('PVA–OPTICAL')
    expect(markup).toContain('role="heading"')
  })

  it('renders English copy through the same locale face', () => {
    const english = { getSnapshot: () => 'en', subscribe: () => () => {} }
    const markup = renderToStaticMarkup(createElement(PmHeroBrandMark, { size: 34, locale: english } as never))
    expect(markup).toContain('Materials research')
    expect(markup).toContain('test mechanisms')
  })

  it('owns the document title and studio marker, and removes them on dispose', async () => {
    const disposers: (() => void)[] = []
    const ctx = {
      effect(factory: () => (() => void) | undefined) {
        const dispose = factory()
        if (typeof dispose === 'function') disposers.push(dispose)
        return dispose
      },
      on: () => () => {},
      slots: { inject: vi.fn() },
      theme: { getTheme: () => ({ active: { colorScheme: 'light' } }) },
      locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
      inject: vi.fn(),
    }
    applyPmStudio(ctx as never)
    expect(document.title).toBe('PolyMechanism Studio')
    expect(document.body.dataset.pmStudio).toBe('')

    document.title = 'DeepSeek Harness'
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(document.title).toBe('PolyMechanism Studio')

    for (const dispose of disposers.reverse()) dispose()
    expect(document.body.dataset.pmStudio).toBeUndefined()
    expect(document.getElementById('pm-studio-design-styles')).toBeNull()
  })

  it('registers research navigation on the existing global panel seats', () => {
    const register = vi.fn()
    const disposers: (() => void)[] = []
    const ctx = {
      effect(factory: () => (() => void) | undefined) {
        const dispose = factory()
        if (dispose) disposers.push(dispose)
      },
      on: () => () => {},
      slots: { inject: (_: string, callback: () => void) => callback(), register },
      theme: { getTheme: () => ({ active: { colorScheme: 'dark' } }) },
      locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
      inject: vi.fn(),
    }
    try {
      applyPmStudio(ctx as never)
      expect(document.body.dataset.pmTheme).toBe('dark')
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'sidebar.panellist', id: 'pm-research-desk' }), expect.any(Function))
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'main', key: 'pm-research-desk' }), expect.any(Function))
    } finally {
      for (const dispose of disposers.reverse()) dispose()
    }
  })

  it('opens research evidence only in the session that owns the header', () => {
    let mounted = 's1'
    const openTab = vi.fn()
    const registerTab = vi.fn()
    const registerSlot = vi.fn()
    const scope = {
      effect: (factory: () => unknown) => factory(),
      slots: { inject: (_: string, callback: () => void) => callback(), register: registerSlot },
      sidebarRight: { mounted: { getSnapshot: () => mounted }, openTab },
      sidebarRightTabs: { register: registerTab },
    }
    applyEvidenceTab({ inject: (_: readonly string[], fn: (value: typeof scope) => void) => fn(scope) } as never, LOCALE)
    expect(registerTab).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pm-research-evidence' }))
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({ name: 'sidebar.right.pane.tab', key: 'pm-research-evidence' }), expect.any(Function))
    const entry = registerSlot.mock.calls.find(([registration]) => registration.name === 'conversation.session.header.utilities')?.[0]
    expect(entry).toBeDefined()
    const { open } = entry.inject('s1')
    open()
    expect(openTab).toHaveBeenCalledExactlyOnceWith('pm-research-evidence')
    mounted = 's2'
    open()
    expect(openTab).toHaveBeenCalledTimes(1)
  })

  it('gates the console on the conversation phase, not a lagging summary', () => {
    const dispose = installPmStudioStyles()
    const sheet = document.getElementById('pm-studio-design-styles')?.textContent ?? ''
    expect(sheet).toContain('[data-phase="hero"] .pm-console')
    expect(sheet).toContain('body[data-pm-studio] .pm-console')
    dispose()
    expect(document.getElementById('pm-studio-design-styles')).toBeNull()
  })
})

describe('PmHomeConsole', () => {
  it('renders six stations, three starts and the live pulse on a blank session', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }))
    vi.stubGlobal('fetch', fetchMock)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(PmHomeConsole, consoleProps())) })

    expect(container.querySelectorAll('.pm-expert')).toHaveLength(6)
    expect(container.querySelectorAll('.pm-quick')).toHaveLength(3)
    expect(container.textContent).toContain('42')
    expect(container.textContent).toContain('7')
    expect(container.textContent).toContain('仿真引擎就绪')
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('科学家')
    expect(fetchMock).toHaveBeenCalledWith('/pm/overview', expect.objectContaining({ cache: 'no-store' }))
  })

  it('renders an explicit error state when the overview route is unavailable', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(PmHomeConsole, consoleProps())) })

    expect(container.textContent).toContain('无法读取研究概况')
    expect(container.textContent).not.toContain('仿真引擎降级')
  })

  it('fills the composer draft from a start instead of sending', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const props = consoleProps()
    await act(async () => { root!.render(createElement(PmHomeConsole, props)) })

    const quick = container.querySelectorAll<HTMLButtonElement>('.pm-quick')[0]!
    await act(async () => { quick.click() })
    const calls = vi.mocked(props.applyPrompt).mock.calls
    expect(calls).toHaveLength(1)
    expect(String(calls[0]?.[0])).toContain('判别实验')
  })

  it('selects the expert through the Host seat', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const props = consoleProps()
    await act(async () => { root!.render(createElement(PmHomeConsole, props)) })

    const physics = [...container.querySelectorAll<HTMLButtonElement>('.pm-expert')]
      .find(button => button.textContent?.includes('物理'))!
    await act(async () => { physics.click() })
    expect(props.selectPreset).toHaveBeenCalledWith('polymer-physicist')
  })

  it('stays in the tree for every phase; the phase gate is CSS-owned', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(createElement(PmHomeConsole, consoleProps({
        session: { blank: false, awaitingFirstTurn: false, running: false, promptAttempted: true },
      } as never)))
    })
    expect(container.querySelector('.pm-console')).not.toBeNull()
  })
})
