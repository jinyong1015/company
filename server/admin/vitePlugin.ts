import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { handleAdminRoute } from './routes.ts'

type Json = Record<string, unknown>

function sendJson(
  res: ServerResponse,
  status: number,
  body: Json,
  setCookie?: string | string[],
) {
  const cookies = setCookie
    ? Array.isArray(setCookie)
      ? setCookie
      : [setCookie]
    : []
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  for (const c of cookies) {
    const prev = res.getHeader('Set-Cookie')
    if (!prev) res.setHeader('Set-Cookie', c)
    else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, c])
    else res.setHeader('Set-Cookie', [String(prev), c])
  }
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (!chunks.length) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function applyResult(
  res: ServerResponse,
  result: NonNullable<Awaited<ReturnType<typeof handleAdminRoute>>>,
) {
  sendJson(res, result.status, result.body, result.setCookie)
}

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const result = await handleAdminRoute({
    method: req.method ?? 'GET',
    pathname: url.pathname,
    cookieHeader: req.headers.cookie,
    searchParams: url.searchParams,
    body: ['POST', 'PATCH', 'PUT'].includes((req.method ?? '').toUpperCase())
      ? await readJsonBody(req)
      : null,
    userAgent: req.headers['user-agent'],
  })
  if (!result) return false
  applyResult(res, result)
  return true
}

function adminMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const rawUrl = req.url ?? '/'
    if (
      !rawUrl.startsWith('/api/admin') &&
      !rawUrl.startsWith('/api/inspection-data')
    ) {
      next()
      return
    }
    const host = req.headers.host ?? 'localhost'
    const url = new URL(rawUrl, `http://${host}`)
    void dispatch(req, res, url)
      .then((handled) => {
        if (!handled) next()
      })
      .catch(() => {
        sendJson(res, 500, { ok: false, message: '서버 오류가 발생했습니다.' })
      })
  }
}

/** Vite 개발·프리뷰 서버에 관리자 API를 붙인다. */
export function adminApiPlugin(): Plugin {
  return {
    name: 'qualitics-admin-api',
    configureServer(server) {
      server.middlewares.use(adminMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(adminMiddleware())
    },
  }
}
