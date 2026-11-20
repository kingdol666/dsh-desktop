/** LAMMPS binary availability probe for the MD layer (docs 10 §10). */

import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Resolved LAMMPS executable and how it was found. */
export interface LammpsRuntime {
  readonly bin: string
  readonly source: 'env-bin' | 'env-home' | 'path'
}

/** Candidate executable names probed on PATH and install roots. */
const CANDIDATES: readonly string[] = [
  'lmp',
  'lmp.exe',
  'lammps',
  'lammps.exe',
  'lmp_serial',
  'lmp_serial.exe',
  'lmp_mpi',
  'lmp_mpi.exe',
]

/**
 * Locate a LAMMPS executable without spawning anything.
 *
 * Order: `PM_LAMMPS_BIN` (executable) → `PM_LAMMPS_HOME` (install root, `bin/`
 * then root) → PATH scan. Resolution failure never throws; the caller reports
 * `md: false` and the tool denies with SIM_UNAVAILABLE.
 * @returns the resolved runtime, or undefined when LAMMPS is not installed.
 */
export function resolveLammps(): LammpsRuntime | undefined {
  const envBin = process.env.PM_LAMMPS_BIN
  if (envBin !== undefined && envBin.length > 0 && existsSync(envBin)) {
    return { bin: envBin, source: 'env-bin' }
  }
  const home = process.env.PM_LAMMPS_HOME
  if (home !== undefined && home.length > 0) {
    for (const base of [join(home, 'bin'), home]) {
      for (const name of CANDIDATES) {
        const candidate = join(base, name)
        if (existsSync(candidate)) return { bin: candidate, source: 'env-home' }
      }
    }
  }
  const path = process.env.PATH ?? ''
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue
    for (const name of CANDIDATES) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return { bin: candidate, source: 'path' }
    }
  }
  return undefined
}
