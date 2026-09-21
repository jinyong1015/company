/**
 * Vercel api 인식 확장자: .js / .mjs / .ts / .tsx  (.cjs 는 미지원)
 * "type":"module" 환경에서 CJS 변환 충돌을 피하려고 .mjs(ESM)로 번들한다.
 */
import * as esbuild from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const builds = [
  { entry: 'api/_src/login.ts', outfile: 'api/admin/login.mjs' },
  { entry: 'api/_src/logout.ts', outfile: 'api/admin/logout.mjs' },
  { entry: 'api/_src/session.ts', outfile: 'api/admin/session.mjs' },
  { entry: 'api/_src/changes.ts', outfile: 'api/inspection-data/changes.mjs' },
  { entry: 'api/_src/record.ts', outfile: 'api/inspection-data/[id].mjs' },
]

await mkdir(path.join(root, 'api/admin'), { recursive: true })
await mkdir(path.join(root, 'api/inspection-data'), { recursive: true })

const stale = [
  'api/admin/login.cjs',
  'api/admin/logout.cjs',
  'api/admin/session.cjs',
  'api/admin/login.js',
  'api/admin/logout.js',
  'api/admin/session.js',
  'api/inspection-data/changes.cjs',
  'api/inspection-data/[id].cjs',
  'api/inspection-data/changes.js',
  'api/inspection-data/[id].js',
]
for (const rel of stale) {
  await rm(path.join(root, rel), { force: true })
}

for (const { entry, outfile } of builds) {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  })
  console.log(`bundled ${outfile}`)
}
