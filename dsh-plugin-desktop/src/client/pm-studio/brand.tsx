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
import { DESKTOP_PRODUCT_NAME } from '../../product-identity.ts'
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
      <span className="pm-wordmark-name">{DESKTOP_PRODUCT_NAME.replace(/\s+Studio$/u, '')}</span>
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
      <PmMark size={Math.max(32, Math.min(size, 42))} className={className} />
      <span className="pm-hero-title" role="heading" aria-level={1}>{copy.headline}</span>
      <span className="pm-hero-sub">{copy.heroDescription}</span>
    </span>
  )
}
