/** Node-side bridge to the oblique biaxial CAE engine (same contract as science/pm_science/cae.py). */

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Provenance block returned by the engine on every result. */
export interface CaeProvenance {
  readonly sourceSha256?: string
  readonly deterministic?: boolean
  readonly calculation?: string
}

/** Solver block of one engine result. */
export interface CaeSolver {
  readonly energy?: number
  readonly status?: string
  readonly converged?: boolean
}

/** One parsed engine result (subset the ledger consumes). */
export interface CaeRunResult {
  readonly schemaVersion?: string
  readonly model?: string
  readonly status?: string
  readonly valid?: boolean
  readonly solver?: CaeSolver
  readonly provenance?: CaeProvenance
  readonly benchmark?: { readonly passed?: boolean }
}

/** Reduced fields the evidence ledger stores for one run. */
export interface CaeSummary {
  readonly status: string | undefined
  readonly valid: boolean | undefined
  readonly model: string | undefined
  readonly schemaVersion: string | undefined
  readonly sourceSha256: string | undefined
  readonly deterministic: boolean | undefined
}

/** Reduced view of one engine result. */
export function summarizeCae(result: CaeRunResult): CaeSummary {
  return {
    status: result.status,
    valid: result.valid,
    model: result.model,
    schemaVersion: result.schemaVersion,
    sourceSha256: result.provenance?.sourceSha256,
    deterministic: result.provenance?.deterministic,
  }
}

/** Extract the last JSON object the engine printed on stdout. */
function extractJson(stdout: string): CaeRunResult {
  for (const line of stdout.trim().split('\n').reverse()) {
    const candidate = line.trim()
    if (candidate.startsWith('{')) {
      try {
        const parsed = JSON.parse(candidate) as CaeRunResult
        return parsed
      } catch {
        // keep scanning older lines
      }
    }
  }
  throw new Error('CAE engine did not print a JSON result')
}

/** CLI flags for one coupon run. */
export interface CouponArgs {
  readonly stretchX: number
  readonly stretchY: number
  readonly mesh?: string
}

/**
 * Spawn one CAE engine invocation.
 * @param caeRoot - absolute checkout of oblique-biaxial-film-stretching-equipment.
 * @param argv - engine CLI arguments (without the script path).
 * @param timeoutMs - subprocess timeout.
 */
export async function spawnCae(caeRoot: string, argv: readonly string[], timeoutMs = 180_000): Promise<CaeRunResult> {
  const script = join(caeRoot, 'scripts', 'cae-run.mjs')
  const child = spawn('node', [script, ...argv], { cwd: caeRoot, shell: false, windowsHide: true })
  let stdout = ''
  let stderr = ''
  let settled = false
  const timer = setTimeout(() => {
    if (!settled) {
      child.kill()
      settled = true
    }
  }, timeoutMs)
  try {
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      child.stdout?.on('data', (chunk: Buffer) => { stdout += String(chunk) })
      child.stderr?.on('data', (chunk: Buffer) => { stderr += String(chunk) })
      child.once('error', rejectExit)
      child.once('exit', (code) => { settled = true; resolveExit(code ?? 1) })
    })
    if (exitCode !== 0) {
      throw new Error(`CAE run exited ${String(exitCode)}: ${stderr.slice(-500)}`)
    }
    return extractJson(stdout)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run the affine verification coupon (fast engine self-check).
 * @param caeRoot - engine checkout root.
 * @param args - coupon stretch parameters.
 */
export async function runCoupon(caeRoot: string, args: CouponArgs): Promise<CaeRunResult> {
  return spawnCae(caeRoot, [
    '--mode', 'coupon',
    '--mesh', args.mesh ?? '4,8',
    '--stretch-x', String(args.stretchX),
    '--stretch-y', String(args.stretchY),
  ])
}

/**
 * Persist one engine result as a project artifact and return its path + digest fields.
 * @param artifactDir - project artifacts directory.
 * @param name - artifact file name (without extension).
 * @param result - parsed engine result.
 */
export async function persistCaeArtifact(artifactDir: string, name: string, result: CaeRunResult): Promise<{ artifactPath: string }> {
  const path = join(artifactDir, `${name}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  return { artifactPath: path }
}
