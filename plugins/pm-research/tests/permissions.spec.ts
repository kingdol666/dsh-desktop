import { describe, expect, it } from 'vitest'
import { canUseTool, PRESET_IDS, TOOL_PERMISSIONS } from '../src/permissions.ts'

describe('tool permission matrix', () => {
  it('allows scientist to create projects but not to record evidence', () => {
    expect(canUseTool('pm_project_create', 'polymer-scientist')).toBe(true)
    expect(canUseTool('pm_evidence_record', 'polymer-scientist')).toBe(false)
  })

  it('allows evidence recording only for characterization/modeler/literature', () => {
    expect(canUseTool('pm_evidence_record', 'polymer-characterization')).toBe(true)
    expect(canUseTool('pm_evidence_record', 'polymer-modeler')).toBe(true)
    expect(canUseTool('pm_evidence_record', 'polymer-literature')).toBe(true)
    expect(canUseTool('pm_evidence_record', 'polymer-reviewer')).toBe(false)
  })

  it('restricts hypothesis transitions to the chief scientist', () => {
    expect(canUseTool('pm_hypothesis_transition', 'polymer-scientist')).toBe(true)
    for (const preset of PRESET_IDS.filter(p => p !== 'polymer-scientist')) {
      expect(canUseTool('pm_hypothesis_transition', preset)).toBe(false)
    }
  })

  it('reserves knowledge review for the independent reviewer', () => {
    expect(canUseTool('pm_knowledge_review', 'polymer-reviewer')).toBe(true)
    expect(canUseTool('pm_knowledge_review', 'polymer-scientist')).toBe(false)
  })

  it('denies unattributed callers and unknown tools closed', () => {
    expect(canUseTool('pm_evidence_query', undefined)).toBe(false)
    expect(canUseTool('nonexistent_tool', 'polymer-scientist')).toBe(false)
    expect(canUseTool('pm_project_create', 'impostor-preset')).toBe(false)
  })

  it('keeps every matrix entry within the known preset roster', () => {
    for (const [tool, allowed] of Object.entries(TOOL_PERMISSIONS)) {
      expect(allowed.length, tool).toBeGreaterThan(0)
      for (const preset of allowed) expect(PRESET_IDS, tool).toContain(preset)
    }
  })
})
