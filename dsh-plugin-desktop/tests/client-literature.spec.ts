// @vitest-environment jsdom
/** Literature page registration: one sidebar launcher + one keyed main page. */

import { describe, expect, it } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { applyLiterature } from '../src/client/literature/index.tsx'

interface Registered {
  readonly name: string
  readonly options: Record<string, unknown>
  readonly component: unknown
}

function fakeContext(): { ctx: ClientContext; registered: Registered[] } {
  const registered: Registered[] = []
  const ctx = {
    locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    slots: {
      inject(name: string, mount: () => unknown) {
        const options = mount() as Record<string, unknown>
        registered.push({ name, options: { ...options, name }, component: (options as { component?: unknown }).component })
        return () => {}
      },
      register(options: Record<string, unknown>, component?: unknown) {
        return { ...options, component }
      },
    },
    effect(fn: () => void) { fn(); return () => {} },
    inject(_names: string[], mount: (scope: unknown) => void) {
      mount({ layout: { selectPanel() {} }, sidebarRight: { openResource() {} }, effect(fn: () => void) { fn(); return () => {} } })
      return () => {}
    },
  } as unknown as ClientContext
  return { ctx, registered }
}

describe('Literature page registration', () => {
  it('registers the sidebar launcher and the keyed main page', () => {
    const { ctx, registered } = fakeContext()
    applyLiterature(ctx)
    const sidebar = registered.find(entry => entry.name === 'sidebar.panellist')
    const main = registered.find(entry => entry.name === 'main')
    expect(sidebar?.options.id).toBe('pm-literature')
    expect(sidebar?.options.order).toBe(20)
    expect(main?.options.key).toBe('pm-literature')
    expect(typeof main?.component).toBe('function')
    expect(document.getElementById('pm-literature-styles')).not.toBeNull()
  })

  it('exposes a workspace face that deduplicates session cwds', () => {
    const registered: Registered[] = []
    const ctx = {
      locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
      sessions: { list: { getSnapshot: () => ({ byId: { a: { cwd: 'D:/ws' }, b: { cwd: 'D:/ws' }, c: { cwd: 'D:/other' } } }) } },
      slots: {
        inject(name: string, mount: () => unknown) {
          const options = mount() as Record<string, unknown>
          registered.push({ name, options, component: (options as { component?: unknown }).component })
          return () => {}
        },
        register(options: Record<string, unknown>, component?: unknown) { return { ...options, component } },
      },
      effect(fn: () => void) { fn(); return () => {} },
      inject(_names: string[], mount: (scope: unknown) => void) {
        mount({ layout: { selectPanel() {} }, sidebarRight: { openResource() {} }, effect(fn: () => void) { fn(); return () => {} } })
        return () => {}
      },
    } as unknown as ClientContext
    applyLiterature(ctx)
    const main = registered.find(entry => entry.name === 'main')
    const inject = main?.options.inject as (() => { workspaces: () => readonly string[] }) | undefined
    expect(inject).toBeTypeOf('function')
    expect(inject?.().workspaces()).toEqual(['D:/ws', 'D:/other'])
  })

  it('opens a PDF through the injected layout and right sidebar', async () => {
    const registered: Registered[] = []
    const calls: string[] = []
    let mountedSession: string | undefined
    let mountWrongSession = false
    const ctx = {
      locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
      sessions: { list: { getSnapshot: () => ({ byId: { a: { cwd: 'D:/ws' } } }) } },
      slots: {
        inject(name: string, mount: () => unknown) {
          const options = mount() as Record<string, unknown>
          registered.push({ name, options, component: (options as { component?: unknown }).component })
          return () => {}
        },
        register(options: Record<string, unknown>, component?: unknown) { return { ...options, component } },
      },
      effect(fn: () => void) { fn(); return () => {} },
      inject(_names: string[], mount: (scope: unknown) => void) {
        mount({
          layout: { selectPanel: (panel: string | null) => {
            calls.push(`panel:${String(panel)}`)
            mountedSession = mountWrongSession ? 'b' : 'a'
          } },
          sidebarRight: {
            mounted: { getSnapshot: () => mountedSession },
            openResource: (address: string) => calls.push(`open:${address}`),
          },
          effect(fn: () => void) { fn(); return () => {} },
        })
        return () => {}
      },
    } as unknown as ClientContext
    applyLiterature(ctx)
    const main = registered.find(entry => entry.name === 'main')
    const face = main?.options.inject as (() => { openPdf: (workspace: string, path: string) => Promise<void> }) | undefined
    await face?.().openPdf('D:/ws', 'D:\\ws\\p.pdf')
    expect(calls[0]).toBe('panel:null')
    expect(calls[1]).toMatch(/^open:dsh-resource:\/\/file\/session\/a\//)

    mountWrongSession = true
    await expect(face?.().openPdf('D:/ws', 'D:\\ws\\p.pdf')).rejects.toThrow('PM_LIT_PDF_SESSION_MISMATCH')
    expect(calls.filter(call => call.startsWith('open:'))).toHaveLength(1)
  })

  it('cancels a pending PDF open when the preview services reload', async () => {
    const registered: Registered[] = []
    const calls: string[] = []
    let disposeServices: (() => void) | undefined
    const ctx = {
      locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
      sessions: { list: { getSnapshot: () => ({ byId: { a: { cwd: 'D:/ws' } } }) } },
      slots: {
        inject(name: string, mount: () => unknown) {
          const options = mount() as Record<string, unknown>
          registered.push({ name, options, component: (options as { component?: unknown }).component })
          return () => {}
        },
        register(options: Record<string, unknown>, component?: unknown) { return { ...options, component } },
      },
      effect(fn: () => void) { fn(); return () => {} },
      inject(_names: string[], mount: (scope: unknown) => void) {
        mount({
          layout: { selectPanel: (panel: string | null) => calls.push(`panel:${String(panel)}`) },
          sidebarRight: { openResource: (address: string) => calls.push(`open:${address}`) },
          effect(fn: () => (() => void) | void) {
            const cleanup = fn()
            if (typeof cleanup === 'function') disposeServices = cleanup
            return () => {}
          },
        })
        return () => {}
      },
    } as unknown as ClientContext
    applyLiterature(ctx)
    const main = registered.find(entry => entry.name === 'main')
    const face = main?.options.inject as (() => { openPdf: (workspace: string, path: string) => Promise<void> }) | undefined
    const pending = face?.().openPdf('D:/ws', 'D:\\ws\\p.pdf').catch(cause => cause)
    disposeServices?.()
    await pending
    expect(calls).toEqual(['panel:null'])
  })
})
