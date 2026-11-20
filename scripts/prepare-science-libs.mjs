#!/usr/bin/env node
/**
 * Prepare `science/pylibs` — the relocatable dependency payload shipped inside
 * the installer (`resources/app/science/pylibs`).
 *
 * A Python venv cannot be shipped: pyvenv.cfg records the build machine's base
 * interpreter. The desktop primary runtime ships a relocatable CPython instead,
 * so the packaged science CLI runs with PYTHONPATH=<pylibs>:<src>.
 *
 * Run per platform (wheels carry platform binaries) before packaging. The
 * script is a no-op once numpy is present.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(repoRoot, 'science', 'pylibs')
const packages = ['numpy', 'scipy', 'pypdf', 'PyYAML']

function alreadyPrepared() {
  return ['numpy', 'scipy', 'pypdf', 'yaml'].every(name => existsSync(join(target, name)))
}

function run(command, args) {
  process.stdout.write(`prepare-science-libs: ${command} ${args.join(' ')}\n`)
  execFileSync(command, args, { stdio: 'inherit', cwd: repoRoot })
}

if (alreadyPrepared()) {
  process.stdout.write(`prepare-science-libs: already present (${target})\n`)
  process.exit(0)
}

mkdirSync(target, { recursive: true })
// Default to public PyPI: CN mirrors are not reachable from every CI host.
// Set PM_PYPI_INDEX to use a mirror on your own machine.
const index = process.env.PM_PYPI_INDEX ? ['--index-url', process.env.PM_PYPI_INDEX] : []
let installed = false
try {
  run('uv', ['pip', 'install', '--target', target, ...index, ...packages])
  installed = true
} catch {
  process.stdout.write('prepare-science-libs: uv unavailable, falling back to python -m pip\n')
}
if (!installed) {
  const python = process.env.PM_PYTHON ?? 'python'
  run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--target', target, ...index, ...packages])
}
if (!alreadyPrepared()) {
  process.stderr.write(`prepare-science-libs: incomplete payload, see ${target}\n`)
  process.exit(1)
}
const entries = readdirSync(target).length
process.stdout.write(`prepare-science-libs: ${entries} entries under ${target}\n`)
