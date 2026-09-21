/**
 * Vercel Serverless용 admin API를 단일 CommonJS 번들로 만든다.
 * package.json "type":"module" + TS .ts import 조합이 런타임 500을 유발하므로
 * 배포 산출물은 .cjs 만 사용한다.
 */
import * as esbuild from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const builds = [
  { entry: 'api/_src/login.ts', outfile: 'api/admin/login.cjs' },
  { entry: 'api/_src/logout.ts', outfile: 'api/admin/logout.cjs' },
  { entry: 'api/_src/session.ts', outfile: 'api/admin/session.cjs' },
  { entry: 'api/_src/changes.ts', outfile: 'api/inspection-data/changes.cjs' },
  { entry: 'api/_src/record.ts', outfile: 'api/inspection-data/[id].cjs' },
]

await mkdir(path.join(root, 'api/admin'), { recursive: true })
await mkdir(path.join(root, 'api/inspection-data'), { recursive: true })

for (const { entry, outfile } of builds) {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'warning',
    // Vercel CJS 런타임은 module.exports === handler 를 기대한다
    footer: {
      js: 'module.exports = module.exports.default || module.exports;',
    },
  })
  console.log(`bundled ${outfile}`)
}
