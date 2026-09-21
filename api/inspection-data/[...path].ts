import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pathFromQuery, runAdminApi } from '../_lib/runAdminApi'

/**
 * /api/inspection-data/changes
 * /api/inspection-data/:id (PATCH)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = pathFromQuery(req.query.path, '/api/inspection-data')
  await runAdminApi(req, res, pathname)
}
