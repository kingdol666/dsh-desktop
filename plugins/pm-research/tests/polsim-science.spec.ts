/** Polysim (analytic polymer physics) bridge: truth values and the full selftest. */

import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { resolveScienceRuntime, runScience } from '../src/science.ts'

function lastJson(stdout: string): Record<string, unknown> {
  const line = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1)
  expect(line, 'python produced no JSON line').toBeDefined()
  return JSON.parse(line!) as Record<string, unknown>
}

describe('polsim science bridge', () => {
  it('recovers the affine orientation truth f(λ=2) = 0.7', async () => {
    const data = await runScience('chain_stats', { beadsPerChain: 100, kuhnLengthNm: 1.0, stretchX: 2.0 })
    const orientation = data.orientation as { orientationF: number }
    expect(orientation.orientationF).toBeCloseTo(0.7, 6)
  }, 60_000)

  it('reports the Flory–Huggins symmetric critical point (N=100 → χc = 0.02)', async () => {
    const data = await runScience('flory', { n1: 100, n2: 100, chi: 0.01, phi: 0.5 })
    expect(data.critical).toMatchObject({ phiCritical: 0.5, chiCritical: 0.02 })
    expect(data.verdict).toBe('STABLE_SINGLE_PHASE')
  }, 60_000)

  it('computes the Gordon–Taylor blend truth (0.5/0.5, 350/450, k=1 → 400 K)', async () => {
    const data = await runScience('tg_blend', {
      part: 'gordon-taylor',
      weight1: 0.5,
      tg1K: 350.0,
      weight2: 0.5,
      tg2K: 450.0,
      kConstant: 1.0,
    })
    expect(data.TgBlendK).toBeCloseTo(400.0, 6)
  }, 60_000)

  it('returns a monotonic 8-chain stress path near the neo-Hookean reference', async () => {
    const data = await runScience('rubber', {
      mode: 'uniaxial',
      shearModulusMPa: 1.0,
      linksPerChain: 200,
      stretchX: 2.0,
      maxStretch: 2.0,
    })
    const path = data.path as { sigmaXMPa: number[] }
    const stresses = path.sigmaXMPa
    expect(stresses[0]).toBeCloseTo(0, 6)
    for (let i = 1; i < stresses.length; i += 1) {
      expect(stresses[i]).toBeGreaterThanOrEqual(stresses[i - 1]!)
    }
    const work = data.workPerVolMPa as number
    const reference = data.neoHookeanRefMPa as number
    expect(work).toBeGreaterThan(0)
    expect(Math.abs(work - reference) / reference).toBeLessThan(0.05)
  }, 60_000)

  it('passes the full Python truth-recovery selftest', async () => {
    const runtime = resolveScienceRuntime()
    const selftest = `${runtime.root.replace(/[\\/]+$/u, '')}/science/src/pm_science/selftest.py`
    const stdout = await new Promise<string>((resolvePromise, rejectPromise) => {
      const child = spawn(runtime.python, ['-I', '--', selftest], {
        cwd: `${runtime.root}/science`,
        shell: false,
        windowsHide: true,
        env: { ...process.env, PATH: runtime.envPath, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })
      let out = ''
      let err = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { out += chunk })
      child.stderr.on('data', (chunk: string) => { err += chunk })
      child.once('error', (cause) => { rejectPromise(cause) })
      child.once('close', (code) => {
        if (code === 0) resolvePromise(out)
        else rejectPromise(new Error(`selftest exited ${String(code)}: ${err.slice(-400)}`))
      })
    })
    const report = lastJson(stdout)
    const summary = report.summary as Record<string, boolean>
    expect(Object.keys(summary).length).toBeGreaterThanOrEqual(16)
    for (const [name, ok] of Object.entries(summary)) {
      expect(ok, `selftest check ${name}`).toBe(true)
    }
  }, 120_000)
})
