/** Host-side bridge to the Python science engine (JSON CLI, no long-lived server). */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { delimiter, isAbsolute, normalize, relative, resolve } from 'node:path'

/** Tools the bridge may invoke. */
export type ScienceTool =
  | 'waxs'
  | 'ftir'
  | 'saxs'
  | 'hermans'
  | 'relax'
  | 'waxs_pro'
  | 'report'
  | 'literature_read'
  | 'literature_search'
  | 'literature_download'
  | 'literature_screen'
  | 'md_run'
  | 'chain_mech'
  | 'rubber'
  | 'viscoelastic'
  | 'chain_stats'
  | 'avrami'
  | 'flory'
  | 'tg_blend'
  | 'diffusion'

/** Optional per-call overrides (timeout only; the interpreter is repository-fixed). */
export interface ScienceConfig {
  readonly timeoutMs?: number
}

/** Resolved interpreter, CLI script, and repository/science root. */
export interface ScienceRuntime {
  readonly root: string
  readonly python: string
  readonly cli: string
  readonly envPath: string
  readonly timeoutMs: number
  /** Interpreter arguments before `--`; isolated mode only for the repo venv. */
  readonly pythonArgs: readonly string[]
  /** Extra environment for the science process (bundled mode sets PYTHONPATH). */
  readonly extraEnv: Readonly<Record<string, string>>
}

/** Failure carrying the code the tool envelope should expose. */
export class ScienceUnavailable extends Error {
  readonly code = 'SCIENCE_UNAVAILABLE'
}

/** Failure reported by the Python process. */
export class ScienceFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/**
 * Resolve the science runtime from the repository layout only.
 *
 * The interpreter is fixed to the repository's private venv (never an
 * environment-selected executable); the literal launcher name below plus
 * `PATH` puts that venv first.
 * @param config - optional per-call timeout.
 * @returns the resolved runtime.
 * @throws ScienceUnavailable when the venv or CLI is missing.
 */
export function resolveScienceRuntime(config: ScienceConfig = {}): ScienceRuntime {
  const root = resolve(import.meta.dirname, '..', '..', '..')
  const scienceRoot = resolve(root, 'science')
  const cli = resolve(scienceRoot, 'src', 'pm_science', 'cli.py')
  if (!existsSync(cli)) throw new ScienceUnavailable(`science CLI missing at ${cli}`)
  const venvDir = resolve(scienceRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin')
  const python = process.platform === 'win32' ? 'python.exe' : 'python'
  const interpreter = resolve(venvDir, python)
  if (existsSync(interpreter)) {
    return {
      root,
      python,
      cli,
      envPath: `${venvDir}${delimiter}${process.env.PATH ?? ''}`,
      timeoutMs: config.timeoutMs ?? 120_000,
      pythonArgs: ['-I'],
      extraEnv: {},
    }
  }
  // Packaged layout: the installer carries `science/pylibs` (pure wheels built per
  // platform at package time) and the desktop primary runtime ships a relocatable
  // CPython. A venv cannot be shipped — pyvenv.cfg records the build machine's
  // base interpreter — so the bundled interpreter runs with PYTHONPATH instead.
  const bundled = resolveBundledPython()
  const pylibs = resolve(scienceRoot, 'pylibs')
  if (bundled !== undefined && existsSync(pylibs)) {
    return {
      root,
      python: bundled,
      cli,
      envPath: `${resolve(scienceRoot, 'pylibs')}${delimiter}${process.env.PATH ?? ''}`,
      timeoutMs: config.timeoutMs ?? 120_000,
      pythonArgs: ['-s'],
      extraEnv: {
        PYTHONPATH: [resolve(scienceRoot, 'src'), pylibs].join(delimiter),
      },
    }
  }
  throw new ScienceUnavailable(
    'science runtime missing: create science/.venv with uv sync (dev), or package with science/pylibs (release)',
  )
}

/**
 * Locate the CPython shipped by the desktop primary runtime.
 * @returns absolute interpreter path, or undefined when no runtime is provisioned.
 */
function resolveBundledPython(): string | undefined {
  const arch = process.arch
  const candidates: string[] = []
  const resources = (process as { resourcesPath?: string }).resourcesPath
  if (typeof resources === 'string' && resources.length > 0) {
    candidates.push(resolve(resources, 'runtime', arch, 'primary-runtime', 'dependencies', 'python'))
  }
  candidates.push(resolve(import.meta.dirname, '..', '..', '..', '.desktop-build', 'runtime', arch, 'primary-runtime', 'dependencies', 'python'))
  candidates.push(resolve(import.meta.dirname, '..', '..', '..', 'dsh-plugin-desktop', '.desktop-build', 'runtime', arch, 'primary-runtime', 'dependencies', 'python'))
  for (const dir of candidates) {
    for (const relative of [['python.exe'], ['bin', 'python3'], ['bin', 'python']]) {
      const candidate = resolve(dir, ...relative)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * Run one science request and return its `data` payload.
 * @param tool - handler name understood by the CLI.
 * @param args - JSON-safe handler arguments (delivered over stdin).
 * @param options - optional timeout and cancellation.
 * @returns the handler's data object.
 */
export async function runScience(
  tool: ScienceTool,
  args: Record<string, unknown>,
  options: ScienceConfig & { readonly signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const runtime = resolveScienceRuntime(options)
  return new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
    // Fixed literal launcher; the repository venv is selected through PATH and
    // `--` ends option parsing before the repository-owned CLI path.
    const child = spawn(runtime.python, [...runtime.pythonArgs, '--', runtime.cli], {
      cwd: resolve(runtime.root, 'science'),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...runtime.extraEnv,
        PATH: runtime.envPath,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      action()
    }
    const onAbort = (): void => {
      child.kill()
      finish(() => { rejectPromise(new ScienceFailure('SCIENCE_ABORTED', 'science request aborted')) })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(() => { rejectPromise(new ScienceFailure('SCIENCE_TIMEOUT', `science request exceeded ${String(runtime.timeoutMs)} ms`)) })
    }, runtime.timeoutMs)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted === true) onAbort()
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', (cause) => {
      finish(() => { rejectPromise(new ScienceFailure('SCIENCE_UNAVAILABLE', cause.message)) })
    })
    child.once('close', (exitCode) => {
      finish(() => {
        const line = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1)
        let payload: unknown
        try {
          payload = line === undefined ? undefined : JSON.parse(line)
        } catch {
          payload = undefined
        }
        if (payload !== null && typeof payload === 'object' && 'ok' in payload) {
          const envelope = payload as { ok: boolean; data?: unknown; error?: { code?: unknown; message?: unknown } }
          if (envelope.ok === true && envelope.data !== null && typeof envelope.data === 'object') {
            resolvePromise(envelope.data as Record<string, unknown>)
            return
          }
          const code = typeof envelope.error?.code === 'string' ? envelope.error.code : 'SCIENCE_TOOL_FAILED'
          const message = typeof envelope.error?.message === 'string' ? envelope.error.message : 'science tool failed'
          rejectPromise(new ScienceFailure(code, message))
          return
        }
        rejectPromise(new ScienceFailure(
          'SCIENCE_TOOL_FAILED',
          `science process exited ${String(exitCode)}: ${stderr.slice(-500) || stdout.slice(-500)}`,
        ))
      })
    })
    child.stdin.end(JSON.stringify({ tool, args }), 'utf8')
  })
}

/** Column selectors for one CSV series. */
export interface CsvSelection {
  readonly x?: string | undefined
  readonly y?: string | undefined
  readonly z?: string | undefined
}

/** One parsed CSV series. */
export interface CsvSeries {
  readonly x: readonly number[]
  readonly y: readonly number[]
  readonly z?: readonly number[]
  readonly header: readonly string[]
}

/**
 * Resolve a user-supplied data path and refuse escapes from the session root.
 * @param input - absolute or workspace-relative path.
 * @param root - session workspace root.
 * @returns the normalized absolute path.
 */
export function resolveDataPath(input: string, root: string): string {
  const absolute = normalize(isAbsolute(input) ? input : resolve(root, input))
  const rel = relative(root, absolute)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ScienceFailure('DATA_OUTSIDE_WORKSPACE', `dataPath must stay inside ${root}`)
  }
  return absolute
}

/** Pick a column by header name or 1-based numeric index. */
function pickColumn(header: readonly string[], selector: string | undefined, fallback: number): number {
  if (selector === undefined || selector === '') return fallback
  const named = header.findIndex(name => name.trim().toLowerCase() === selector.trim().toLowerCase())
  if (named >= 0) return named
  const index = Number(selector)
  if (!Number.isInteger(index) || index < 0) {
    throw new ScienceFailure('DATA_COLUMN_NOT_FOUND', `column "${selector}" not found in ${header.join(', ')}`)
  }
  // Numeric selectors are 1-based in the tool contract.
  return index === 0 ? 0 : index - 1
}

/**
 * Read two/three numeric columns from a delimited text file.
 * @param path - absolute file path (already checked against the workspace).
 * @param selection - column names or 1-based indices.
 * @returns parallel numeric arrays.
 */
export async function readCsvSeries(path: string, selection: CsvSelection = {}): Promise<CsvSeries> {
  const text = await readFile(path, 'utf8')
  const lines = text.split(/\r?\n/u).filter(line => line.trim() !== '' && !line.trimStart().startsWith('#'))
  if (lines.length < 11) throw new ScienceFailure('DATA_TOO_SHORT', `${path} has fewer than 10 data rows`)
  const delimiter = lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(';') ? ';' : ','
  const header = lines[0]!.split(delimiter).map(cell => cell.trim().replace(/^"|"$/gu, ''))
  const xi = pickColumn(header, selection.x, 0)
  const yi = pickColumn(header, selection.y, 1)
  const zi = selection.z === undefined ? -1 : pickColumn(header, selection.z, -1)
  const x: number[] = []
  const y: number[] = []
  const z: number[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter)
    const xv = Number(cells[xi])
    const yv = Number(cells[yi])
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue
    if (zi >= 0) {
      const zv = Number(cells[zi])
      if (!Number.isFinite(zv)) continue
      z.push(zv)
    }
    x.push(xv)
    y.push(yv)
  }
  if (x.length < 10) throw new ScienceFailure('DATA_TOO_SHORT', `${path} has fewer than 10 numeric rows`)
  return zi >= 0 ? { x, y, z, header } : { x, y, header }
}

/** Session runtime face needed to resolve the safety root. */
interface RuntimeAgentLike {
  readonly session?: { readonly header?: { readonly cwd?: string } }
}

/**
 * Resolve the workspace root for path checks from the calling Agent.
 * @param agent - `exec.agent` (undefined outside an agent loop).
 * @returns the session cwd, or the Host process cwd.
 */
export function sessionWorkspace(agent: unknown): string {
  const runtime = agent as RuntimeAgentLike | undefined
  const cwd = runtime?.session?.header?.cwd
  return cwd !== undefined && cwd.length > 0 ? cwd : process.cwd()
}
