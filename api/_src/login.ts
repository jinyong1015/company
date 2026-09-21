import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAdminApi } from './runAdminApi.ts'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runAdminApi(req, res, '/api/admin/login')
}
