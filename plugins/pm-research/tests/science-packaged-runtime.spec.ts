/** Packaged science payload: the shipped CPython + science/pylibs must run the
 * CLI without any venv, which is what the installer relies on (a venv cannot be
 * relocated: pyvenv.cfg records the build machine's base interpreter). */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '..', '..', '..')
const pylibs = join(repoRoot, 'science', 'pylibs')
const cli = join(repoRoot, 'science', 'src', 'pm_science', 'cli.py')
const arch = process.arch

function bundledPython(): string | undefined {
  const candidates = [
    join(repoRoot, '.desktop-build', 'runtime', arch, 'primary-runtime', 'dependencies', 'python'),
    join(repoRoot, 'dsh-plugin-desktop', '.desktop-build', 'runtime', arch, 'primary-runtime', 'dependencies', 'python'),
  ]
  for (const dir of candidates) {
    for (const relative of [['python.exe'], ['bin', 'python3'], ['bin', 'python']]) {
      const candidate = join(dir, ...relative)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

const python = bundledPython()
const ready = python !== undefined && existsSync(pylibs) && existsSync(cli)

describe.skipIf(!ready)('packaged science payload', () => {
  it('runs a real characterization handler on the shipped interpreter and pylibs', { timeout: 120_000 }, () => {
    const azimuth = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180]
    // Peak along the draw axis (0/180 deg) gives a positive Hermans factor;
    // a peak at 90 deg would be negative (perpendicular alignment).
    const intensity = [9.6, 8.3, 5.1, 2.3, 1.1, 2.4, 4.9, 8.1, 9.4]
    const result = spawnSync(python!, ['-s', '--', cli], {
      cwd: join(repoRoot, 'science'),
      input: JSON.stringify({ tool: 'hermans', args: { azimuth, intensity } }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: [join(repoRoot, 'science', 'src'), pylibs].join(';'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })
    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).at(-1)!)
    expect(payload.ok).toBe(true)
    expect(typeof payload.data.hermansFactor).toBe('number')
    expect(payload.data.hermansFactor).toBeGreaterThan(0.5)
  })
})
