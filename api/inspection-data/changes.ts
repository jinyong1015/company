import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAdminApi } from '../_lib/runAdminApi'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runAdminApi(req, res, '/api/inspection-data/changes')
}
