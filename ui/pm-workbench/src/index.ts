/** PolyMechanism research workbench: client plugin entry (skeleton — panels land in G007+). */

/** Workbench client surface version. */
export const PM_WORKBENCH_VERSION = 1 as const

/**
 * Marker describing the workbench milestone this skeleton belongs to. The Dockview
 * shell (PmShell), Project Rail, Inspector, and StatusBar register real slots from
 * G007 onward; see docs/polymechanism/07-前端设计与交互规范.md.
 */
export const PM_WORKBENCH_MILESTONE = 'G007-pending' as const
