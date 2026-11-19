import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'pm-research',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: false,
  sourcemap: true,
  outExtensions: () => ({ js: '.js' }),
  external: [/^@deepseek-ai\//, /^node:/],
  noExternal: [/^@polymechanism\//],
})
