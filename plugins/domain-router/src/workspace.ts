/** Canonical workspace identity used by domain tools and authenticated routes. */

import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, sep } from 'node:path'

export interface RegisteredWorkspace {
  readonly id: string
  readonly path: string
}

export interface WorkspaceRegistryLike {
  resolveByPath(path: string): Promise<RegisteredWorkspace | undefined>
}

/** Resolve a caller-supplied path only through DSH's registered workspace index. */
export async function resolveRegisteredWorkspace(
  registry: WorkspaceRegistryLike | undefined,
  raw: unknown,
): Promise<RegisteredWorkspace | undefined> {
  if (registry === undefined || typeof raw !== 'string') return undefined
  const value = raw.trim()
  if (value === '' || value.includes('\u0000') || !isAbsolute(value)) return undefined
  try {
    return await registry.resolveByPath(value)
  } catch {
    return undefined
  }
}

/** Convert an internal workspace path into a stable client-facing relative path. */
export function relativeWorkspacePath(workspace: string, path: string): string | undefined {
  if (!isAbsolute(path) || path.includes('\u0000')) return undefined
  const value = relative(workspace, path)
  if (value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value)) return undefined
  return value === '' ? '.' : value.replaceAll(sep, '/')
}

/** Check the real target, or the closest existing parent for an uncreated path. */
export async function isContainedWorkspacePath(workspace: string, path: string): Promise<boolean> {
  if (relativeWorkspacePath(workspace, path) === undefined) return false
  try {
    const root = await realpath(workspace)
    let existing = path
    while (true) {
      try {
        await lstat(existing)
        break
      } catch (cause) {
        const parent = dirname(existing)
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT' || parent === existing || existing === workspace) return false
        existing = parent
      }
    }
    // If the existing entry is a dangling link, realpath fails closed.
    return relativeWorkspacePath(root, await realpath(existing)) !== undefined
  } catch {
    return false
  }
}
