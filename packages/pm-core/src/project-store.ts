/** Project store: one JSON file per project under `<dataRoot>/projects/`. */

import { mkdir, readFile, readdir, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { EntityId, ResearchProject } from '@polymechanism/pm-domain'

/** File name for a single project record. */
const PROJECT_FILE = 'project.json'

/** JSON-file persistence for research projects (atomic via temp+rename). */
export class ProjectStore {
  private constructor(private readonly root: string) {}

  /**
   * Open the project store rooted at `root` (usually `<dataRoot>/projects`).
   * @param root - absolute directory holding one folder per project.
   */
  static open(root: string): ProjectStore {
    return new ProjectStore(root)
  }

  private dir(id: EntityId): string {
    return join(this.root, id)
  }

  /**
   * Persist one project (create or update).
   * @param project - full project record to store.
   */
  async put(project: ResearchProject): Promise<ProjectRecordWrite> {
    const dir = this.dir(project.id)
    await mkdir(dir, { recursive: true })
    const final = join(dir, PROJECT_FILE)
    const temp = join(dir, `.${PROJECT_FILE}.tmp`)
    await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, 'utf8')
    await rename(temp, final)
    return { id: project.id, revision: project.status }
  }

  /**
   * Read one project.
   * @param id - project entity id.
   */
  async get(id: EntityId): Promise<ResearchProject | undefined> {
    try {
      const raw = await readFile(join(this.dir(id), PROJECT_FILE), 'utf8')
      return JSON.parse(raw) as ResearchProject
    } catch {
      return undefined
    }
  }

  /** List all projects by scanning the store root (one folder per project). */
  async list(): Promise<ResearchProject[]> {
    const names = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    const projects: ResearchProject[] = []
    for (const entry of names) {
      if (!entry.isDirectory()) continue
      const project = await this.get(entry.name as EntityId)
      if (project !== undefined) projects.push(project)
    }
    return projects
  }

  /**
   * Archive one project (status flip only; records are never deleted).
   * @param id - project entity id.
   */
  async archive(id: EntityId): Promise<void> {
    const project = await this.get(id)
    if (project === undefined) throw new Error(`project ${id} not found`)
    await this.put({ ...project, status: 'archived' })
  }

  /** Remove the store directory (test helper only; production never deletes). */
  async __purgeForTests(): Promise<void> {
    await rm(this.root, { recursive: true, force: true })
  }
}

/** Result of one project write. */
export interface ProjectRecordWrite {
  readonly id: EntityId
  /** Status written (optimistic-concurrency token arrives with G004). */
  readonly revision: string
}
