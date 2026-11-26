/** Active-domain state and stable workspace identity. */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { statePath } from './registry.ts'
import type { DomainState } from './types.ts'

/** Stable short workspace id used in cognition tags and workspace scoping. */
export function workspaceId(workspace: string): string {
  return createHash('sha256').update(resolve(workspace)).digest('hex').slice(0, 16)
}

/** Read the active domain state; corrupt/missing state is treated as absent. */
export async function readState(workspace: string): Promise<DomainState | undefined> {
  const file = statePath(workspace)
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    if (typeof record.domain !== 'string' || record.domain.trim() === '') return undefined
    return {
      schemaVersion: 1,
      domain: record.domain.trim(),
      ...(typeof record.projectId === 'string' && record.projectId.trim() !== ''
        ? { projectId: record.projectId.trim() }
        : {}),
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    }
  } catch {
    return undefined
  }
}

/** Atomically persist the active domain state. */
export async function writeState(workspace: string, state: DomainState): Promise<void> {
  const file = statePath(workspace)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
}
