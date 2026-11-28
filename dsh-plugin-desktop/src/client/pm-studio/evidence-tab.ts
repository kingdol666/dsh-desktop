/** On-demand research evidence within the normal session rightbar. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { PanelRight } from 'lucide-react'
import { createElement } from 'react'
import { pmStudioCopy, usePmStudioCopy, type PmLocaleFace } from './copy.ts'
import { PmResearchDesk } from './workbench.tsx'

const EVIDENCE_TAB = 'pm-research-evidence'

function EvidenceButton({ locale, open }: { readonly locale: PmLocaleFace; readonly open: () => void }) {
  const { evidenceTab } = usePmStudioCopy(locale)
  return createElement('button', {
    type: 'button', className: 'dshDesktopPmEvidenceButton', onClick: open,
    title: evidenceTab, 'aria-label': evidenceTab,
  }, createElement(PanelRight, { size: 15, strokeWidth: 1.7, 'aria-hidden': true }), createElement('span', null, evidenceTab))
}

function EvidenceBody({ locale }: { readonly locale: PmLocaleFace }) {
  return createElement(PmResearchDesk, { locale, initialTab: 'evidence' })
}

/** Register a page-type tab, never a competing file or PDF resource resolver.
 * @param ctx - desktop client plugins context.
 * @param locale - reactive Studio copy face.
 */
export function applyEvidenceTab(ctx: ClientContext, locale: PmLocaleFace): void {
  // Rightbar is optional and its lifetime differs from the main conversation.
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope: ClientContext) => {
    scope.effect(() => scope.sidebarRightTabs.register({
      id: EVIDENCE_TAB,
      kind: EVIDENCE_TAB,
      title: () => pmStudioCopy(locale.getSnapshot()).evidenceTab,
    }), 'dsh-plugin-desktop: research evidence tab type')
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab',
      key: EVIDENCE_TAB,
      inject: () => ({ locale }),
    }, EvidenceBody))
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities',
      id: EVIDENCE_TAB,
      order: 15,
      inject: sessionId => ({
        locale,
        open: () => {
          // Opening a tab against a stale header would reveal it in another Session.
          if (scope.sidebarRight.mounted.getSnapshot() === sessionId) scope.sidebarRight.openTab(EVIDENCE_TAB)
        },
      }),
    }, EvidenceButton))
  })
}
