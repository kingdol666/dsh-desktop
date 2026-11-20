/**
 * Blank-home research console: six expert stations, three task starts, and the
 * live project pulse. Registered above the composer through the upstream
 * `conversation.input.dock` list slot and shown only while the conversation
 * root publishes `data-phase="hero"`, so an active conversation keeps its
 * uncluttered composer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Atom, BookOpen, Boxes, ChartLine, ChartSpline, FlaskConical, Network, ShieldCheck,
} from 'lucide-react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation SlotMap merge and the session standard kit.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { usePmStudioCopy, type PmLocaleFace } from './copy.ts'

/** One selectable expert station: id + icon (copy comes from the locale set). */
interface ExpertStation {
  readonly id: string
  readonly Icon: LucideIcon
}

/** The six presets shipped in `cordis.patch.yml`, in station order. */
const EXPERT_ORDER: readonly ExpertStation[] = Object.freeze([
  { id: 'polymer-scientist', Icon: FlaskConical },
  { id: 'polymer-physicist', Icon: Atom },
  { id: 'polymer-characterization', Icon: ChartSpline },
  { id: 'polymer-modeler', Icon: Boxes },
  { id: 'polymer-literature', Icon: BookOpen },
  { id: 'polymer-reviewer', Icon: ShieldCheck },
])

/** Icon per quick-start id. */
const QUICK_ICONS: Readonly<Record<string, LucideIcon>> = Object.freeze({
  design: FlaskConical,
  analyze: ChartLine,
  review: Network,
})

/** `/pm/overview` success envelope (docs 09 §1.2). */
interface PmOverviewEnvelope {
  readonly ok: true
  readonly data: {
    readonly totals: {
      readonly projects: number
      readonly evidence: number
      readonly hypotheses: number
      readonly supported: number
      readonly refuted: number
      readonly pendingKnowledge: number
    }
    readonly sim: { readonly analytic: boolean; readonly md: boolean }
  }
}

/** Registration-side capabilities for the console. */
export interface PmHomeConsoleInjected {
  /** Select the expert preset for the blank session; rejects with the Host reason. */
  selectPreset: (presetId: string) => Promise<void>
  /** Put a starter prompt in the composer and focus it; false when not retained. */
  applyPrompt: (text: string) => boolean
  /** Active locale face for the studio copy set. */
  locale: PmLocaleFace
}

/** Full component props. */
export type PmHomeConsoleProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<PmHomeConsoleInjected>

/** Pulse load state, including the explicit error state required by docs 07. */
type PulseState = 'loading' | 'ready' | 'error'

/**
 * Render the blank-home station rail.
 * @param props - composed slot props (session, input, station actions, locale).
 * @returns the console; styles hide it outside the hero phase.
 */
export function PmHomeConsole({
  sessionId, useSessions, selectPreset, applyPrompt, locale,
}: PmHomeConsoleProps) {
  const copy = usePmStudioCopy(locale)
  const activePreset = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' ? value : ''
  })
  const [overview, setOverview] = useState<PmOverviewEnvelope['data'] | null>(null)
  const [pulseState, setPulseState] = useState<PulseState>('loading')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let live = true
    void fetch('/pm/overview', { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(async (response) => (response.ok ? await response.json() as PmOverviewEnvelope : null))
      .then((payload) => {
        if (!live) return
        if (payload !== null && payload.ok === true) {
          setOverview(payload.data)
          setPulseState('ready')
        } else {
          setPulseState('error')
        }
      })
      .catch(() => { if (live) setPulseState('error') })
    return () => { live = false }
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
  }, [])

  const say = useCallback((message: string) => {
    setNotice(message)
    setFailure('')
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => { setNotice('') }, 2400)
  }, [])

  const choose = useCallback((station: ExpertStation) => {
    const label = copy.experts[station.id]?.label ?? station.id
    setBusy(station.id)
    setFailure('')
    void selectPreset(station.id).then(
      () => { say(copy.switched(label)) },
      (cause: unknown) => {
        setNotice('')
        setFailure(cause instanceof Error ? cause.message : String(cause))
      },
    ).finally(() => { setBusy('') })
  }, [copy, say, selectPreset])

  const start = useCallback((prompt: string) => {
    say(applyPrompt(prompt) ? copy.filled : copy.fillFailed)
  }, [applyPrompt, copy, say])

  const pulse = overview?.totals
  return (
    <section className="pm-console" aria-label={copy.consoleLabel} data-pm-home-console>
      <div className="pm-console-head">
        <span className="pm-console-label">{copy.stationLabel}</span>
        <div className="pm-experts" role="group" aria-label={copy.stationLabel}>
          {EXPERT_ORDER.map((station) => {
            const expert = copy.experts[station.id]
            const selected = activePreset === station.id
            return (
              <button
                key={station.id}
                type="button"
                className="pm-expert"
                aria-pressed={selected}
                aria-busy={busy === station.id || undefined}
                title={expert?.hint}
                onClick={() => { choose(station) }}
              >
                <station.Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                {expert?.label ?? station.id}
              </button>
            )
          })}
        </div>
        <span className="pm-console-ready">
          <span className="pm-console-dot" aria-hidden="true" />
          {busy === '' ? copy.ready : copy.switching}
        </span>
      </div>

      <div className="pm-quick-row" role="group" aria-label={copy.quick.map(action => action.title).join(' · ')}>
        {copy.quick.map((action) => {
          const Icon = QUICK_ICONS[action.id] ?? FlaskConical
          return (
            <button key={action.id} type="button" className="pm-quick" onClick={() => { start(action.prompt) }}>
              <span className="pm-quick-icon">
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="pm-quick-body">
                <span className="pm-quick-title">{action.title}</span>
                <span className="pm-quick-hint">{action.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="pm-pulse-row">
        <span className="pm-pulse-label">{copy.pulseLabel}</span>
        {pulseState === 'loading' ? (
          <span className="pm-pulse-empty">{copy.pulseLoading}</span>
        ) : pulseState === 'error' ? (
          <span className="pm-pulse-empty pm-console-failure">{copy.pulseUnavailable}</span>
        ) : pulse === undefined || pulse.projects === 0 ? (
          <span className="pm-pulse-empty">{copy.pulseEmpty}</span>
        ) : (
          <span className="pm-pulse-items">
            <span className="pm-pulse-item"><b>{pulse.evidence}</b>{copy.evidenceUnit}</span>
            <span className="pm-pulse-item"><b>{pulse.hypotheses}</b>{copy.hypothesisUnit}</span>
            <span className="pm-pulse-item"><b>{pulse.pendingKnowledge}</b>{copy.knowledgeUnit}</span>
            <span className="pm-pulse-item"><b>{pulse.projects}</b>{copy.projectUnit}</span>
          </span>
        )}
        {pulseState === 'ready' && overview !== null ? (
          <span className={overview.sim.analytic ? 'pm-sim pm-sim-on' : 'pm-sim'}>
            <span className="pm-console-dot" aria-hidden="true" />
            {overview.sim.analytic ? (overview.sim.md ? copy.simReadyMd : copy.simReady) : copy.simDegraded}
          </span>
        ) : null}
      </div>

      <p className="pm-console-note" role="status" aria-live="polite">
        {failure !== '' ? <span className="pm-console-failure">{failure}</span> : notice}
      </p>
    </section>
  )
}
