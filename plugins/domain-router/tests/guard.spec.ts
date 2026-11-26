import type { Context } from '@deepseek-ai/cordis'
import type { ToolGuard } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { registerDomainGuard } from '../src/guard.ts'

function setup(preset: string | undefined, headerPreset: string | undefined): ToolGuard {
  let guard: ToolGuard | undefined
  const context = {
    reflect: {
      get(name: string) {
        if (name !== 'agentPresets') return undefined
        return { composedPreset: () => preset }
      },
    },
    inject(_names: string[], mount: (scope: {
      tools: { guard(value: ToolGuard): () => void }
      effect: () => void
    }) => void) {
      mount({ tools: { guard(value) { guard = value; return () => {} } }, effect() {} })
    },
  } as unknown as Context
  registerDomainGuard(context, { homeDir: '', expertPresets: new Set(['polymer-physicist']) })
  if (guard === undefined) throw new Error('guard was not registered')
  return guard
}

describe('domain cognition guard', () => {
  it('uses the live composed preset instead of a stale session header', () => {
    const guard = setup('polymer-physicist', 'standard')
    expect(guard({
      name: 'cognition_recall',
      agent: { ctx: {} as Context, session: { header: { agentPreset: 'standard' } } },
    } as unknown as Parameters<ToolGuard>[0])).toContain('domain_recall')
  })

  it('does not block when the live composition is not an expert preset', () => {
    const guard = setup('standard', 'polymer-physicist')
    expect(guard({
      name: 'cognition_recall',
      agent: { ctx: {} as Context, session: { header: { agentPreset: 'polymer-physicist' } } },
    } as unknown as Parameters<ToolGuard>[0])).toBeUndefined()
  })

  it('falls back to the header when no live agent context is available', () => {
    const guard = setup(undefined, 'polymer-physicist')
    expect(guard({
      name: 'cognition_recall',
      agent: { session: { header: { agentPreset: 'polymer-physicist' } } },
    } as unknown as Parameters<ToolGuard>[0])).toContain('domain_recall')
  })
})
