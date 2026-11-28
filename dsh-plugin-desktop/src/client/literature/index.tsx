/** Literature page registration: sidebar launcher + keyed main page. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { literatureCopy } from './copy.ts'
import { LiteraturePage, type LiteraturePageInjected } from './LiteraturePage.tsx'
import { installLiteratureStyles } from './styles.ts'

const PANEL_ID = 'pm-literature'

interface SessionRow {
  readonly cwd?: unknown
}

interface SessionsLike {
  readonly list: {
    getSnapshot(): { byId?: Record<string, SessionRow> }
  }
}

interface LayoutLike {
  selectPanel(panel: string | null): void
}

interface SidebarRightLike {
  readonly mounted: { getSnapshot(): string | undefined }
  openResource(address: string): void
}

interface PreviewServices {
  layout?: LayoutLike
  sidebarRight?: SidebarRightLike
}

type PreviewTimer = ReturnType<typeof setTimeout>
type PreviewSchedule = (callback: () => void, onCancel: () => void) => void

function schedulePreview(
  pendingTimers: Map<PreviewTimer, () => void>,
  callback: () => void,
  onCancel: () => void,
): void {
  const timer = setTimeout(() => {
    pendingTimers.delete(timer)
    callback()
  }, 80)
  pendingTimers.set(timer, onCancel)
}

function sessionsOf(ctx: ClientContext): SessionsLike {
  return (ctx as unknown as { sessions: SessionsLike }).sessions
}

function workspaceList(ctx: ClientContext): string[] {
  const snapshot = sessionsOf(ctx).list.getSnapshot()
  const values = Object.values(snapshot.byId ?? {})
  const cwds = values
    .map(row => (typeof row.cwd === 'string' && row.cwd.trim() !== '' ? row.cwd : ''))
    .filter(cwd => cwd !== '')
  return [...new Set(cwds)]
}

function sessionForWorkspace(ctx: ClientContext, workspace: string): string | undefined {
  const snapshot = sessionsOf(ctx).list.getSnapshot()
  for (const [sessionId, row] of Object.entries(snapshot.byId ?? {})) {
    if (row.cwd === workspace) return sessionId
  }
  return undefined
}

/** Build a `dsh-resource://file/session/<id>/<path>` address; keep drive colons. */
function fileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  const encoded = normalized.split('/').map(segment => (
    /^[A-Za-z]:$/u.test(segment) ? segment : encodeURIComponent(segment)
  )).join('/')
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`
}

function workspacePath(workspace: string, path: string): string {
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(path)) return path
  return `${workspace.replace(/[\\/]+$/u, '')}/${path.replace(/^[\\/]+/u, '')}`
}

function openPdf(
  services: PreviewServices,
  ctx: ClientContext,
  workspace: string,
  path: string,
  schedule: PreviewSchedule,
): Promise<void> {
  const sessionId = sessionForWorkspace(ctx, workspace)
  if (sessionId === undefined) return Promise.reject(new Error('PM_LIT_PDF_NO_WORKSPACE_SESSION'))
  const { layout, sidebarRight } = services
  if (layout === undefined || sidebarRight === undefined) return Promise.reject(new Error('PM_LIT_PDF_PREVIEW_UNAVAILABLE'))
  // The global main panel unmounts the Session surface; restore Conversation and
  // open only after the right bar reports the exact workspace Session on screen.
  layout.selectPanel(null)
  const expectedSidebarRight = sidebarRight
  return new Promise((resolve, reject) => {
    schedule(() => {
      if (services.sidebarRight !== expectedSidebarRight) {
        reject(new Error('PM_LIT_PDF_PREVIEW_UNAVAILABLE'))
        return
      }
      // openResource acts on the mounted Session. Never send a different
      // workspace's file to that Session; leave the tab unopened on mismatch.
      if (expectedSidebarRight.mounted.getSnapshot() !== sessionId) {
        reject(new Error('PM_LIT_PDF_SESSION_MISMATCH'))
        return
      }
      try {
        expectedSidebarRight.openResource(fileAddress(sessionId, workspacePath(workspace, path)))
        resolve()
      } catch (cause) {
        reject(cause)
      }
    }, () => reject(new Error('PM_LIT_PDF_PREVIEW_UNAVAILABLE')))
  })
}

function LiteratureIcon({ size = 18, active = false }: { size?: number; active?: boolean }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16.5H6.5A1.5 1.5 0 0 0 5 21V4.5Z"
        stroke={active ? 'currentColor' : 'currentColor'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5 18.5h13.5M8.5 7h7M8.5 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Register the Literature launcher and page for the Desktop client. */
export function applyLiterature(ctx: ClientContext): void {
  ctx.effect(() => installLiteratureStyles(), 'dsh-plugin-desktop: literature styles')
  // `layout` is owned by the shell and `sidebarRight` by the right-bar plugin;
  // resolve both through a scoped inject so the page can outlive either reload.
  const services: PreviewServices = {}
  const pendingTimers = new Map<PreviewTimer, () => void>()
  ctx.inject(['layout', 'sidebarRight'], (scope: ClientContext) => {
    const resolved = scope as unknown as { layout: LayoutLike; sidebarRight: SidebarRightLike }
    services.layout = resolved.layout
    services.sidebarRight = resolved.sidebarRight
    scope.effect(() => () => {
      for (const [timer, cancel] of pendingTimers) {
        clearTimeout(timer)
        cancel()
      }
      pendingTimers.clear()
      delete services.layout
      delete services.sidebarRight
    }, 'dsh-plugin-desktop: literature preview services')
  })
  const face: LiteraturePageInjected = {
    workspaces: () => workspaceList(ctx),
    openPdf: (workspace, path) => openPdf(
      services,
      ctx,
      workspace,
      path,
      (callback, onCancel) => schedulePreview(pendingTimers, callback, onCancel),
    ),
    locale: ctx.locale,
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => literatureCopy(ctx.locale.getSnapshot().active).title,
  }, LiteratureIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    inject: () => face,
  }, LiteraturePage))
}
