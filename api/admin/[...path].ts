import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pathFromQuery, runAdminApi } from '../_lib/runAdminApi'

/**
 * /api/admin/login | logout | session
 * Vercel 서버리스 — 로컬 Vite 플러그인과 동일 핸들러 사용
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = pathFromQuery(req.query.path, '/api/admin')
  await runAdminApi(req, res, pathname)
}
