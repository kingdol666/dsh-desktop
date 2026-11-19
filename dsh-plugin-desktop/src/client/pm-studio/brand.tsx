/**
 * PolyMechanism brand occupants for the upstream brand slots.
 *
 * The sidebar mark/name and the blank-home mark are single-occupant slots with
 * framework fallbacks, so registering here replaces the DeepSeek artwork
 * without forking the Web UI. Geometry stays in the host's seat; this module
 * owns only the artwork and the product lockup.
 */

import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DesktopProductMark } from '../DesktopFrameTitlebarView.tsx'
import { usePmStudioCopy, type PmLocaleFace } from './copy.ts'

/** Locale face injected into the brand occupants. */
export type PmBrandInjected = InjectFace<{ readonly locale: PmLocaleFace }>

/**
 * Render the PolyMechanism chain mark through the titlebar's single SVG source.
 * @param props - requested square edge and host class.
 * @returns the brand mark.
 */
export function PmMark({ size = 24, className }: {
  readonly size?: number
  readonly className?: string | undefined
}) {
  return <DesktopProductMark size={size} className={className} />
}

/**
 * Sidebar mark occupant (expanded lockup and collapsed rail share it).
 * @param props - host mark geometry.
 * @returns the brand mark at the requested edge.
 */
export function PmSidebarBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <PmMark size={size} />
}

/**
 * Sidebar product wordmark occupant.
 * @param props - injected locale face.
 * @returns the PolyMechanism wordmark with its STUDIO capsule.
 */
export function PmSidebarBrandName({ locale }: PmBrandInjected) {
  const copy = usePmStudioCopy(locale)
  return (
    <span className="pm-wordmark" translate="no">
      <span className="pm-wordmark-name">PolyMechanism</span>
      <span className="pm-wordmark-tag">{copy.brandTag}</span>
    </span>
  )
}

/**
 * Blank-home lockup. The host renders this occupant inside the headline row and
 * its own title group is hidden by the studio stylesheet, because the product
 * headline, protocol label, and subtitle are one composition.
 * @param props - requested mark edge, host class, and injected locale face.
 * @returns the protocol kicker, heading, and subline.
 */
export function PmHeroBrandMark({ size, className, locale }: HeroBrandMarkOwnerProps & PmBrandInjected) {
  const copy = usePmStudioCopy(locale)
  return (
    <span className="pm-hero-lockup" data-pm-hero-lockup>
      <span className="pm-hero-lattice" aria-hidden="true">
        <svg viewBox="0 0 520 390" fill="none">
          <path d="M40 330 L118 286 L196 330 L274 286 L352 330 L430 286" stroke="currentColor" strokeWidth="1" />
          <path d="M118 286 L118 210 L196 166 L274 210 L274 286" stroke="currentColor" strokeWidth="1" />
          <path d="M196 166 L196 90 L274 46 L352 90 L352 166" stroke="currentColor" strokeWidth="1" />
          <path d="M396 96 L438 120 L438 168 L396 192 L354 168 L354 120 Z" stroke="currentColor" strokeWidth="1" />
          <path d="M438 120 L480 96 L522 120 L522 168 L480 192 L438 168 Z" stroke="currentColor" strokeWidth="1" />
          <circle cx="118" cy="210" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="196" cy="166" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="274" cy="210" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="352" cy="286" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="396" cy="144" r="7" fill="none" stroke="var(--pm-brand)" strokeWidth="1.5" />
          <circle cx="480" cy="144" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
      <span className="pm-hero-kicker">
        <PmMark size={Math.min(size, 18)} className={className} />
        <span className="pm-hero-rule" aria-hidden="true" />
        {copy.kicker}
        <span className="pm-hero-protocol">{copy.protocol}</span>
      </span>
      <span className="pm-hero-title-row">
        <span className="pm-hero-title" role="heading" aria-level={1}>
          {copy.headlineLead}
          <span className="pm-hero-accent">{copy.headlineAccent}</span>
          {copy.headlineTail}
        </span>
      </span>
      <span className="pm-hero-sub">
        {copy.subLead}
        <span className="pm-hero-sep">·</span>
        {copy.subMid}
        <span className="pm-hero-sep">·</span>
        {copy.subTail}
      </span>
    </span>
  )
}
