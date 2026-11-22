/** Tool permission matrix — server-side authorization over docs 09 §6. */

/** Preset identities allowed per tool. Absence = no preset may call it. */
export const TOOL_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'pm_project_create': Object.freeze(['polymer-scientist']),
  'pm_evidence_record': Object.freeze(['polymer-characterization', 'polymer-modeler', 'polymer-literature']),
  'pm_evidence_query': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
    'polymer-reviewer',
  ]),
  'pm_evidence_verify': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
    'polymer-reviewer',
  ]),
  'pm_hypothesis_propose': Object.freeze(['polymer-scientist', 'polymer-physicist', 'polymer-modeler']),
  'pm_hypothesis_transition': Object.freeze(['polymer-scientist']),
  'pm_mechanism_import_seed': Object.freeze(['polymer-scientist']),
  'pm_mechanism_query': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
    'polymer-reviewer',
  ]),
  'pm_mechanism_propose_edge': Object.freeze(['polymer-physicist', 'polymer-scientist']),
  'pm_knowledge_query': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
    'polymer-reviewer',
  ]),
  'pm_knowledge_propose': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
  ]),
  'pm_knowledge_review': Object.freeze(['polymer-reviewer']),
  'pm_gate_check': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-characterization',
    'polymer-modeler',
    'polymer-literature',
    'polymer-reviewer',
  ]),
  'pm_experiment_plan': Object.freeze([
    'polymer-scientist',
    'polymer-physicist',
    'polymer-modeler',
    'polymer-characterization',
  ]),
  'pm_waxs_pro': Object.freeze([
    'polymer-scientist',
    'polymer-characterization',
    'polymer-physicist',
    'polymer-modeler',
  ]),
  'pm_analysis_report': Object.freeze([
    'polymer-scientist',
    'polymer-characterization',
    'polymer-physicist',
    'polymer-modeler',
    'polymer-literature',
  ]),
  'pm_sim_chain_mechanics': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_rubber_elasticity': Object.freeze(['polymer-modeler', 'polymer-physicist', 'polymer-scientist']),
  'pm_sim_viscoelastic': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_chain_stats': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_crystallization': Object.freeze(['polymer-characterization', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_flory_huggins': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_tg_blend': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_diffusion': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_sim_md_run': Object.freeze(['polymer-modeler', 'polymer-physicist', 'polymer-scientist']),
  'pm_waxs_analyze': Object.freeze(['polymer-characterization', 'polymer-scientist']),
  'pm_ftir_analyze': Object.freeze(['polymer-characterization', 'polymer-scientist']),
  'pm_saxs_analyze': Object.freeze(['polymer-characterization', 'polymer-scientist']),
  'pm_hermans_analyze': Object.freeze(['polymer-physicist', 'polymer-characterization', 'polymer-scientist']),
  'pm_model_fit': Object.freeze(['polymer-physicist', 'polymer-modeler', 'polymer-scientist']),
  'pm_literature_read': Object.freeze(['polymer-literature', 'polymer-scientist']),
  'pm_literature_extract': Object.freeze(['polymer-literature', 'polymer-scientist']),
  'pm_literature_search': Object.freeze(['polymer-literature', 'polymer-scientist']),
  'pm_literature_screen': Object.freeze(['polymer-literature', 'polymer-scientist']),
  'pm_literature_download': Object.freeze(['polymer-literature', 'polymer-scientist']),
})

/** All preset identities known to the matrix. */
export const PRESET_IDS: readonly string[] = Object.freeze([
  'polymer-scientist',
  'polymer-physicist',
  'polymer-characterization',
  'polymer-modeler',
  'polymer-literature',
  'polymer-reviewer',
])

/** Resolve the live preset from the Agent's composed registry binding. */
export type PresetResolver = (exec: { readonly agent?: unknown }) => string | undefined

/**
 * Resolve the preset that is actually executing a tool call.
 *
 * Priority: the live Agent preset registry (covers a selection committed
 * after the session header was written) → the session header → the model's
 * `preset` hint. The hint is last and cannot override a real identity.
 * @param args - model arguments carrying the optional `preset` hint.
 * @param exec - tool execution context (`agent.session.header.agentPreset`).
 * @param resolve - optional live registry lookup.
 * @returns the acting preset id, if any.
 */
export function actingPreset(
  args: { readonly preset?: string | undefined },
  exec: { readonly agent?: unknown },
  resolve?: PresetResolver,
): string | undefined {
  const live = resolve?.(exec)
  if (live !== undefined && live.length > 0) return live
  const agent = exec.agent as {
    readonly session?: { readonly header?: { readonly agentPreset?: unknown } }
  } | undefined
  const committed = agent?.session?.header?.agentPreset
  if (typeof committed === 'string' && committed.length > 0) return committed
  return args.preset
}

/**
 * Whether `presetId` may invoke `tool`. Unknown presets are denied closed.
 * @param tool - tool name.
 * @param presetId - acting preset identity; empty for unattributed callers (denied unless tool allows any).
 */
export function canUseTool(tool: string, presetId: string | undefined): boolean {
  const allowed = TOOL_PERMISSIONS[tool]
  if (allowed === undefined) return false
  if (presetId === undefined || presetId.length === 0) return false
  return allowed.includes(presetId)
}
