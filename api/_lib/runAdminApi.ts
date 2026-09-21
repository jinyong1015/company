import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleAdminRoute,
  type AdminRouteResult,
} from '../../server/admin/routes'

function readCookieHeader(req: VercelRequest): string | undefined {
  const raw = req.headers.cookie
  if (Array.isArray(raw)) return raw.join('; ')
  return raw
}

function applyResult(res: VercelResponse, result: AdminRouteResult) {
  const cookies = result.setCookie
    ? Array.isArray(result.setCookie)
      ? result.setCookie
      : [result.setCookie]
    : []
  if (cookies.length === 1) res.setHeader('Set-Cookie', cookies[0]!)
  else if (cookies.length > 1) res.setHeader('Set-Cookie', cookies)
  res.status(result.status).json(result.body)
}

export async function runAdminApi(
  req: VercelRequest,
  res: VercelResponse,
  pathname: string,
): Promise<boolean> {
  try {
    const url = new URL(req.url ?? pathname, 'http://localhost')
    const result = await handleAdminRoute({
      method: req.method ?? 'GET',
      pathname,
      cookieHeader: readCookieHeader(req),
      searchParams: url.searchParams,
      body: req.body ?? null,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined,
    })
    if (!result) {
      res.status(404).json({ ok: false, message: 'Not found' })
      return false
    }
    applyResult(res, result)
    return true
  } catch (err) {
    const message =
      err instanceof Error && /ADMIN_SESSION_SECRET/.test(err.message)
        ? 'ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.'
        : '서버 오류가 발생했습니다.'
    res.status(500).json({ ok: false, message })
    return true
  }
}

export function pathFromQuery(
  path: string | string[] | undefined,
  prefix: string,
): string {
  const segs = Array.isArray(path) ? path : path ? [path] : []
  const joined = segs.join('/')
  return joined ? `${prefix}/${joined}` : prefix
}
