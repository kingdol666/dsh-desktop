/**
 * PolyMechanism Studio client surface.
 *
 * Registers the brand occupants the official artwork used to fill, the
 * blank-home research console, and the studio stylesheet. All registrations
 * ride Desktop-owned effects so a mode switch or plugin disposal removes them
 * without leaving a half-themed document.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pull the SlotMap merges for the brand and dock slots.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { DESKTOP_PRODUCT_NAME } from '../../product-identity.ts'
import type { PmHomeConsoleInjected } from './home-console.tsx'
import type { PmLocaleFace } from './copy.ts'
import { pmStudioCopy } from './copy.ts'
import { PmHeroBrandMark, PmSidebarBrandMark, PmSidebarBrandName } from './brand.tsx'
import { PmHomeConsole } from './home-console.tsx'
import { PmWorkbench, type PmWorkbenchInjected } from './workbench.tsx'
import { installPmStudioStyles } from './styles.ts'

/** The Host's preset selection result, narrowed to what the seat needs. */
type PresetSelectResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: { readonly message: string; readonly details?: unknown } }

/** Minimal face of the remote preset namespace (typed by its own plugin). */
interface PresetRemote {
  select(sessionId: string, presetId: string): Promise<PresetSelectResult>
}

/**
 * Mount the brand, console, and theme attribute for every Desktop shell mode.
 * @param ctx - browser Cordis context with slots, sessions, remote, and theme.
 */
export function applyPmStudio(ctx: ClientContext): void {
  // Stable locale face shared by every studio occupant; subscribe() keeps the
  // copy set reactive without giving components the whole locale service.
  const localeFace: PmLocaleFace = {
    getSnapshot: () => ctx.locale.getSnapshot().active,
    subscribe: listener => ctx.locale.subscribe(listener),
  }

  ctx.effect(() => installPmStudioStyles(), 'dsh-plugin-desktop: pm-studio design tokens')

  ctx.effect(() => {
    // The Web document title is still the upstream product name; the window and
    // task-switcher read it, so the rebrand owns it too. Upstream sessions
    // rewrite the title as they open, so re-assert it on head mutations.
    document.body.dataset.pmStudio = ''
    const enforce = (): void => {
      if (document.title !== DESKTOP_PRODUCT_NAME) document.title = DESKTOP_PRODUCT_NAME
    }
    enforce()
    const observer = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(enforce)
    observer?.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => {
      observer?.disconnect()
      delete document.body.dataset.pmStudio
    }
  }, 'dsh-plugin-desktop: pm-studio product document marker')

  ctx.effect(() => {
    const applyTheme = (): void => {
      document.body.dataset.pmTheme = ctx.theme.getTheme().active.colorScheme
    }
    applyTheme()
    const off = ctx.on('theme/change', () => { applyTheme() })
    return () => {
      off()
      delete document.body.dataset.pmTheme
    }
  }, 'dsh-plugin-desktop: pm-studio theme attribute')

  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, PmSidebarBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    inject: () => ({ locale: localeFace }),
  }, PmSidebarBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    inject: () => ({ locale: localeFace }),
  }, PmHeroBrandMark))

  // The console needs the preset seat; brand and theme must survive a profile
  // that disables agent presets, so the dependency is scoped to this surface.
  ctx.inject(['remote.agentPresets'], (scope) => {
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock',
      id: 'pm-home-console',
      order: -10,
      inject: (sessionId): PmHomeConsoleInjected => {
        const actx = scope.sessions.scope(sessionId)
        const conversation = actx?.get('conversation')
        const remote = (scope.remote as unknown as { agentPresets?: PresetRemote }).agentPresets
        return {
          locale: localeFace,
          async selectPreset(presetId) {
            if (remote === undefined) throw new Error(pmStudioCopy(localeFace.getSnapshot()).seatUnavailable)
            const result = await remote.select(sessionId, presetId)
            if (!result.ok) {
              const details = result.error.details
              const reason = typeof details === 'object' && details !== null && 'reason' in details
                && typeof (details as { reason?: unknown }).reason === 'string'
                ? (details as { reason: string }).reason
                : result.error.message
              throw new Error(reason)
            }
            // Focus lands where the next action happens once the Host applies
            // the composition; a transient missing scope must not break click.
            try {
              if (conversation !== undefined && actx !== undefined) conversation.input.for(actx).focus()
            } catch { /* composer not retained yet */ }
          },
          applyPrompt(text) {
            if (conversation === undefined || actx === undefined) return false
            try {
              const input = conversation.input.for(actx)
              input.setDraft(text)
              input.focus()
              return true
            } catch {
              // The composer may not be retained yet during a session switch;
              // the console reports the miss instead of claiming success.
              return false
            }
          },
        }
      },
    }, PmHomeConsole))
    // The workbench only needs the composer hand-off; it reads project state
    // over the same-origin /pm routes the Host registers.
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock',
      id: 'pm-workbench',
      order: -9,
      inject: (sessionId): PmWorkbenchInjected => {
        const actx = scope.sessions.scope(sessionId)
        const conversation = actx?.get('conversation')
        return {
          applyPrompt(text) {
            if (conversation === undefined || actx === undefined) return false
            try {
              const input = conversation.input.for(actx)
              input.setDraft(text)
              input.focus()
              return true
            } catch {
              return false
            }
          },
        }
      },
    }, PmWorkbench))
  })
}
