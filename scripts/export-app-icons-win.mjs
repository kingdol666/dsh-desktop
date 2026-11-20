/** Regenerate the Stable desktop icon set from PolymerMark.svg on any host.
 *
 * The upstream export (scripts/export-app-icons.mjs) needs macOS Icon Composer;
 * this script renders the same committed source artwork with sharp and keeps
 * every contract `tests/package.spec.ts` pins:
 *   - 16-bit RGBA PNGs for the canonical and macOS renditions
 *   - the macOS rendition centered with the 100-pixel visual inset (824 box)
 *   - an ICO with exact-DPI BMP frames up to 128 plus one PNG frame at 256
 *   - a legacy ICNS with PNG chunks from 32 to 1024
 *   - one tray source in the fixed brand blue `#4D6BFE`
 * and rewrites `app-icon.resources.json` so `icons:export --check` keeps
 * verifying source↔output integrity on every host.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const build = join(root, 'dsh-plugin-desktop', 'build')
const requireFromDesktop = createRequire(join(root, 'dsh-plugin-desktop', 'package.json'))
const sharp = requireFromDesktop('sharp')

const MARK = join(build, 'app-icon.icon', 'Assets', 'PolymerMark.svg')
const TRAY_MARK = join(build, 'app-icon.icon', 'Assets', 'TrayMark.svg')

/** Exact-DPI Windows frames: BMP entries up to 128, one PNG entry at 256. */
const ICO_BMP_SIZES = Object.freeze([16, 20, 24, 28, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128])
/** hicolor theme sizes committed for the Stable set (mirrors the committed directory). */
const LINUX_SIZES = Object.freeze([16, 32, 48, 64, 128, 256, 512, 1024])
/** macOS ICNS PNG chunk types by pixel size. */
const ICNS_TYPES = Object.freeze([[32, 'ic11'], [64, 'ic12'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']])
/** Tray images consumed by src/index.ts (template tinted by the shell, fixed brand blue otherwise). */
const TRAY_ICONS = Object.freeze([
  ['tray-iconTemplate.png', '#000000', 16],
  ['tray-iconTemplate@2x.png', '#000000', 32],
  ['tray-icon-blue.png', '#4D6BFE', 16],
  ['tray-icon-blue@1.25x.png', '#4D6BFE', 20],
  ['tray-icon-blue@1.5x.png', '#4D6BFE', 24],
  ['tray-icon-blue@2x.png', '#4D6BFE', 32],
])

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** Rasterize the mark at one square size, optionally sharpened for tiny sizes. */
function renderRaw(size, { sharpen = false, colourspace = 'srgb' } = {}) {
  let pipeline = sharp(MARK, { density: 300, failOn: 'warning' })
    .resize({ width: size, height: size, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .toColourspace(colourspace)
    .ensureAlpha()
  if (sharpen) pipeline = pipeline.sharpen({ sigma: size <= 32 ? 0.5 : 0.35 })
  return pipeline
}

/** Canonical 1024px PNG: 16-bit RGBA like the Composer export. */
async function renderCanonical(output) {
  await renderRaw(1024, { colourspace: 'rgb16' }).png({ compressionLevel: 9 }).toFile(output)
}

/** macOS rendition: the artwork in the centered 824 box with 100px transparent margins. */
async function renderMac(output) {
  const artwork = await renderRaw(824, { colourspace: 'rgb16' }).png().toBuffer()
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: artwork, left: 100, top: 100 }])
    .toColourspace('rgb16')
    .png({ compressionLevel: 9 })
    .toFile(output)
}

/** One ICO BMP frame: BITMAPINFOHEADER + bottom-up BGRA XOR + empty AND mask. */
async function bmpFrame(size) {
  const raw = await renderRaw(size, { sharpen: size <= 96 }).raw().toBuffer()
  const maskRow = Math.ceil(size / 32) * 4
  const maskSize = maskRow * size
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(size * size * 4 + maskSize, 20)
  const xor = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    const sourceRow = (size - 1 - y) * size * 4
    const targetRow = y * size * 4
    for (let x = 0; x < size; x += 1) {
      const s = sourceRow + x * 4
      const d = targetRow + x * 4
      xor[d] = raw[s + 2]
      xor[d + 1] = raw[s + 1]
      xor[d + 2] = raw[s]
      xor[d + 3] = raw[s + 3]
    }
  }
  return Buffer.concat([header, xor, Buffer.alloc(maskSize)])
}

/** Pack the ICO: BMP frames in ascending order, then the 256px PNG frame. */
async function packIco(output) {
  const bmps = []
  for (const size of ICO_BMP_SIZES) bmps.push({ size, data: await bmpFrame(size) })
  const png256 = await renderRaw(256).png({ compressionLevel: 9 }).toBuffer()
  const frames = [...bmps, { size: 256, data: png256 }]
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  const entries = Buffer.alloc(16 * frames.length)
  let offset = header.length + entries.length
  frames.forEach((frame, index) => {
    const entry = index * 16
    entries.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry)
    entries.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry + 1)
    entries.writeUInt8(0, entry + 2)
    entries.writeUInt8(0, entry + 3)
    entries.writeUInt16LE(1, entry + 4)
    entries.writeUInt16LE(32, entry + 6)
    entries.writeUInt32LE(frame.data.length, entry + 8)
    entries.writeUInt32LE(offset, entry + 12)
    offset += frame.data.length
  })
  writeFileSync(output, Buffer.concat([header, entries, ...frames.map(frame => frame.data)]))
}

/** Pack a legacy macOS ICNS with PNG chunks from 32 to 1024. */
async function packIcns(output) {
  const chunks = []
  for (const [size, type] of ICNS_TYPES) {
    const png = await renderRaw(size).png().toBuffer()
    const chunk = Buffer.alloc(8)
    chunk.write(type, 0, 'ascii')
    chunk.writeUInt32BE(png.length + 8, 4)
    chunks.push(chunk, png)
  }
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  writeFileSync(output, Buffer.concat([header, body]))
}

/** Render the hicolor set from the canonical artwork. */
async function renderLinuxSet() {
  for (const size of LINUX_SIZES) {
    await renderRaw(size, { sharpen: size <= 96 }).png({ compressionLevel: 9 }).toFile(join(build, 'icons', `${size}x${size}.png`))
  }
}

/** Render one tray glyph in the requested color at the requested size. */
async function renderTray(name, color, size) {
  const vector = readFileSync(TRAY_MARK, 'utf8')
  const colored = await sharp(Buffer.from(vector.replaceAll('COLOR', color)), { density: 300 })
    .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(build, name), colored)
}

/** Rewrite the stable resource record so `--check` keeps verifying integrity. */
async function writeRecord(sourceSha256) {
  const outputs = {}
  for (const name of ['app-icon.png', 'app-icon-mac.png', 'app-icon.ico', 'app-icon.icns']) {
    outputs[name] = hash(readFileSync(join(build, name)))
  }
  const record = {
    source: 'app-icon.icon',
    sourceSha256,
    mac: { input: 'app-icon.icon', legacy: 'app-icon.icns', catalogName: 'Icon' },
    png: { platform: 'macOS', rendition: 'Default', designGeneration: 28, size: 1024 },
    outputs,
  }
  writeFileSync(join(build, 'app-icon.resources.json'), `${JSON.stringify(record, null, 2)}\n`)
}

const { iconSourceDigest } = await import('./export-app-icons.mjs')

await renderCanonical(join(build, 'app-icon.png'))
await renderMac(join(build, 'app-icon-mac.png'))
await packIco(join(build, 'app-icon.ico'))
await packIcns(join(build, 'app-icon.icns'))
await renderLinuxSet()
for (const [name, color, size] of TRAY_ICONS) await renderTray(name, color, size)
await writeRecord(iconSourceDigest(join(build, 'app-icon.icon')))
console.log('stable icon set regenerated from PolymerMark.svg')
