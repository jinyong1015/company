import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAdminApi } from '../_lib/runAdminApi'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.id
  const id = encodeURIComponent(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''))
  await runAdminApi(req, res, `/api/inspection-data/${id}`)
}
