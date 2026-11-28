// @vitest-environment jsdom
/** Stable Workbench reads the Host ledger and stages, but does not send, draft actions. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PmResearchDesk, PmWorkbench } from '../src/client/pm-studio/workbench.tsx'

const PROJECT = { id: 'p/1', title: 'PVA trials', status: 'active', domain: 'pva-optical-film' }
const OTHER = { id: 'p-2', title: 'Control project', status: 'paused', domain: 'generic-polymer' }
const RECORDS = [
  { id: 'ev-01', claimSupport: 'Measured film response', polarity: 'supports', strength: 'strong', sourceRef: { type: 'doi', ref: '10.5555/film' }, hash: 'full-hash-for-first-record', recordedAt: '2026-10-03T14:30:00Z', observationId: 'obs-05', payload: { haze: { value: 4.2, unit: '%' } } },
  { id: 'ev-02', claimSupport: 'Independent replication', polarity: 'neutral', strength: 'moderate', sourceRef: { type: 'file', ref: 'javascript:alert(1)' }, hash: 'full-hash-for-second-record', recordedAt: '2026-10-04T14:30:00Z' },
]
const SNAPSHOT = {
  project: { ...PROJECT, question: 'Does processing change haze?' },
  evidence: RECORDS,
  hypotheses: [{
    id: 'h1', statement: 'Processing changes haze', status: 'under_test', competitors: [], evidenceIds: ['ev-02'],
    transitions: [{ to: 'under_test', at: '2026-10-04T14:30:00Z', rationale: 'A later measurement supports testing.', evidenceIds: ['ev-01'] }],
  }],
  mechanism: { nodes: [], edges: [] },
  knowledge: [],
  ledger: { verified: true, chainLength: 2 },
}

function response(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { headers: { 'content-type': 'application/json' } })
}

let container: HTMLDivElement
let root: Root
let composer: HTMLTextAreaElement | undefined

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  composer?.remove()
  composer = undefined
  vi.unstubAllGlobals()
})

function stubProjects() {
  const fetchMock = vi.fn(async (path: string) => {
    if (path === '/pm/projects') return response({ projects: [PROJECT] })
    if (path === '/pm/projects/p%2F1/state') return response(SNAPSHOT)
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function click(label: string, within: ParentNode = container) {
  const button = Array.from(within.querySelectorAll<HTMLButtonElement>('button'))
    .find(node => (node.getAttribute('aria-label') ?? node.textContent?.trim()) === label)
  expect(button, label).toBeDefined()
  await act(async () => button!.click())
  return button!
}

describe('Stable research desk', () => {
  it('renders the real project and drills from a hypothesis to its recorded evidence source', async () => {
    const fetchMock = stubProjects()
    await act(async () => root.render(createElement(PmResearchDesk, { locale: 'en', applyPrompt: vi.fn() })))

    expect(container.textContent).toContain('PVA trials')
    expect(container.textContent).toContain('Does processing change haze?')
    expect(container.textContent).toContain('Ledger verified')
    expect(container.textContent).not.toContain('PLA, PMMA, PETG')
    await click('Hypotheses', container.querySelector('nav')!)
    await click('ev-02')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('table [aria-pressed="true"]')?.textContent).toBe('ev-02')
    expect(container.textContent).toContain('full-hash-for-second-record')
    expect(container.querySelector('a')).toBeNull()

    await click('Hypotheses', container.querySelector('nav')!)
    const history = container.querySelector('details')!
    expect(history.textContent).toContain('A later measurement supports testing.')
    history.open = true
    await click('ev-01', history)
    expect(container.querySelector('table [aria-pressed="true"]')?.textContent).toBe('ev-01')
    expect(container.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://doi.org/10.5555/film')
    expect(container.textContent).toContain('obs-05')
    expect(container.textContent).toContain('4.2')
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/pm/projects', '/pm/projects/p%2F1/state'])
  })

  it('does not expose a late snapshot from a previously selected project', async () => {
    let resolvePrevious!: (value: Response) => void
    const previous = new Promise<Response>(resolve => { resolvePrevious = resolve })
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/pm/projects') return response({ projects: [PROJECT, OTHER] })
      if (path === '/pm/projects/p%2F1/state') return previous
      if (path === '/pm/projects/p-2/state') return response({ ...SNAPSHOT, project: OTHER, evidence: [], hypotheses: [] })
      throw new Error(`Unexpected request: ${path}`)
    }))
    await act(async () => root.render(createElement(PmResearchDesk, { locale: 'en', applyPrompt: vi.fn() })))
    const select = container.querySelector('select')!
    await act(async () => {
      select.value = OTHER.id
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => resolvePrevious(response(SNAPSHOT)))
    expect(container.querySelector('h1')?.textContent).toBe(OTHER.title)
    expect(container.textContent).not.toContain('Does processing change haze?')
  })

  it('loads through the dock only when opened, handles Escape, and keeps a failed draft actionable', async () => {
    const fetchMock = stubProjects()
    composer = document.createElement('textarea')
    document.body.append(composer)
    const applyPrompt = vi.fn<(text: string) => boolean>()
      .mockReturnValueOnce(false)
      .mockImplementationOnce(() => { composer?.focus(); return true })
    await act(async () => root.render(createElement(PmWorkbench, { locale: 'en', applyPrompt })))
    expect(fetchMock).not.toHaveBeenCalled()

    const launcher = await click('Research workbench')
    let dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!
    expect(dialog).not.toBeNull()
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBe(dialog)
    expect(dialog.contains(document.activeElement)).toBe(true)
    await click('Check evidence gaps', dialog)
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Composer is not ready')
    expect(dialog.open).toBe(true)

    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(launcher)

    await click('Research workbench')
    dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!
    await click('Check evidence gaps', dialog)
    expect(applyPrompt).toHaveBeenCalledTimes(2)
    expect(applyPrompt.mock.calls[1]?.[0]).toContain('evidence chain')
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(composer)
  })

  it('can mount evidence-first without a composer', async () => {
    stubProjects()
    await act(async () => root.render(createElement(PmResearchDesk, { locale: 'en', initialTab: 'evidence' })))
    expect(container.querySelector('nav [aria-pressed="true"]')?.getAttribute('aria-label')).toBe('Data & evidence')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('h1')).toBeNull()
  })

  it('returns from a keyed desk without staging into an unmounted composer', async () => {
    stubProjects()
    const onOpenConversation = vi.fn()
    await act(async () => root.render(createElement(PmResearchDesk, { locale: 'en', onOpenConversation })))
    expect(container.textContent).not.toContain('Check evidence gaps')
    await click('Return to conversation')
    expect(onOpenConversation).toHaveBeenCalledOnce()
  })

  it('distinguishes an empty list from a failed request and retries the same route', async () => {
    const fetchMock = vi.fn<(path: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: 'ledger unavailable' } }), { status: 500 }))
      .mockResolvedValueOnce(response({ projects: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => root.render(createElement(PmResearchDesk, { locale: 'en', applyPrompt: vi.fn() })))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('INTERNAL')
    expect(container.textContent).not.toContain('No projects yet')
    await click('Retry')
    expect(container.textContent).toContain('No projects yet')
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/pm/projects', '/pm/projects'])
  })
})
