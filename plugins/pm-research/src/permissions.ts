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
  'pm_cae_run': Object.freeze(['polymer-modeler', 'polymer-scientist']),
  'pm_cae_coupon': Object.freeze(['polymer-modeler', 'polymer-characterization', 'polymer-scientist']),
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
