/** Read-only PM project metadata validation (no PM engine dependency). */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Minimal project metadata needed by domain tools/routes. */
export interface ProjectInfo {
  readonly id: string
  readonly title: string
  readonly domain: string
}

/** Read one project.json; missing/invalid returns undefined. */
export async function readProject(homeDir: string, projectId: string): Promise<ProjectInfo | undefined> {
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(projectId)) return undefined
  const file = join(homeDir, 'pm', 'projects', projectId, 'project.json')
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    return {
      id: typeof record.id === 'string' ? record.id : projectId,
      title: typeof record.title === 'string' ? record.title : projectId,
      domain: typeof record.domain === 'string' ? record.domain : 'unknown',
    }
  } catch {
    return undefined
  }
}

/** Read one project only when it is bound to the selected domain. */
export async function readProjectForDomain(
  homeDir: string,
  projectId: string,
  domain: string,
): Promise<ProjectInfo | undefined> {
  const project = await readProject(homeDir, projectId)
  return project?.domain === domain ? project : undefined
}
