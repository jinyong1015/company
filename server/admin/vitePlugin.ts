import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { appendChangeLog, listChangeLogs } from './audit.ts'
import { isAdminPasswordConfigured, verifyAdminPassword } from './password.ts'
import {
  ADMIN_SESSION_COOKIE,
  buildClearCookieHeader,
  buildSetCookieHeader,
  createSessionPayload,
  decodeSession,
  encodeSession,
  isSessionValid,
  readCookieValue,
  requireAdminFromCookie,
  touchSession,
} from './session.ts'

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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function asStatus(value: unknown): {
  isAnalysisEligible: boolean
  errorCodes: string[]
} {
  const rec = asRecord(value)
  return {
    isAnalysisEligible: Boolean(rec.isAnalysisEligible),
    errorCodes: asStringArray(rec.errorCodes),
  }
}

async function handleAdminApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { pathname } = url
  const method = (req.method ?? 'GET').toUpperCase()
  const cookie = req.headers.cookie

  if (pathname === '/api/admin/login' && method === 'POST') {
    try {
      if (!isAdminPasswordConfigured()) {
        sendJson(res, 503, {
          ok: false,
          message: '관리자 비밀번호가 서버에 설정되지 않았습니다.',
        })
        return true
      }
      const body = (await readJsonBody(req)) as { password?: unknown } | null
      const password = typeof body?.password === 'string' ? body.password : ''
      if (!password.trim()) {
        sendJson(res, 400, {
          ok: false,
          message: '관리자 비밀번호를 입력해 주세요.',
        })
        return true
      }
      const valid = await verifyAdminPassword(password)
      if (!valid) {
        sendJson(res, 401, {
          ok: false,
          message: '관리자 비밀번호가 올바르지 않습니다.',
        })
        return true
      }
      const session = createSessionPayload()
      sendJson(
        res,
        200,
        {
          ok: true,
          message: '관리자 모드로 로그인되었습니다.',
          expiresAt: session.exp,
        },
        buildSetCookieHeader(encodeSession(session)),
      )
    } catch {
      sendJson(res, 500, {
        ok: false,
        message: '로그인 처리 중 오류가 발생했습니다.',
      })
    }
    return true
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    sendJson(res, 200, { ok: true }, buildClearCookieHeader())
    return true
  }

  if (pathname === '/api/admin/session' && method === 'GET') {
    const token = readCookieValue(cookie, ADMIN_SESSION_COOKIE)
    const payload = decodeSession(token)
    if (!isSessionValid(payload)) {
      sendJson(
        res,
        200,
        { authenticated: false },
        token ? buildClearCookieHeader() : undefined,
      )
      return true
    }
    const refreshed = touchSession(payload)
    sendJson(
      res,
      200,
      {
        authenticated: true,
        expiresAt: refreshed.exp,
        sessionId: refreshed.sid,
      },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
    return true
  }

  if (pathname === '/api/inspection-data/changes' && method === 'GET') {
    const auth = requireAdminFromCookie(cookie)
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, message: auth.message })
      return true
    }
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const items = await listChangeLogs(limit)
    const refreshed = touchSession(auth.session)
    sendJson(
      res,
      200,
      { ok: true, items },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
    return true
  }

  const patchMatch = pathname.match(/^\/api\/inspection-data\/([^/]+)$/)
  if (patchMatch && method === 'PATCH') {
    const auth = requireAdminFromCookie(cookie)
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, message: auth.message })
      return true
    }
    const id = decodeURIComponent(patchMatch[1] ?? '')
    if (!id) {
      sendJson(res, 400, { ok: false, message: '수정 대상 ID가 없습니다.' })
      return true
    }
    const body = (await readJsonBody(req)) as {
      reason?: unknown
      before?: unknown
      after?: unknown
      fields?: unknown
      statusBefore?: unknown
      statusAfter?: unknown
    } | null
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      sendJson(res, 400, {
        ok: false,
        message: '수정 사유를 입력해 주세요.',
      })
      return true
    }
    const before = asRecord(body?.before)
    const after = asRecord(body?.after)
    const fields = asStringArray(body?.fields)
    const clientInfo = req.headers['user-agent']?.slice(0, 240) ?? 'unknown'
    const entry = await appendChangeLog({
      recordId: id,
      fields: fields.length > 0 ? fields : Object.keys(after),
      before,
      after,
      reason,
      sessionId: auth.session.sid,
      clientInfo,
      statusBefore: asStatus(body?.statusBefore),
      statusAfter: asStatus(body?.statusAfter),
    })
    const refreshed = touchSession(auth.session)
    sendJson(
      res,
      200,
      {
        ok: true,
        changeId: entry.id,
        message:
          '검사 DATA가 수정되었습니다. 변경 내용이 전체 분석 메뉴에 반영되었습니다.',
      },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
    return true
  }

  return false
}

function adminMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const rawUrl = req.url ?? '/'
    if (!rawUrl.startsWith('/api/admin') && !rawUrl.startsWith('/api/inspection-data')) {
      next()
      return
    }
    const host = req.headers.host ?? 'localhost'
    const url = new URL(rawUrl, `http://${host}`)
    void handleAdminApi(req, res, url).then((handled) => {
      if (!handled) next()
    }).catch(() => {
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
