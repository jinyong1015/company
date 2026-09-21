import { appendChangeLog, listChangeLogs } from './audit.ts'
import { isAdminPasswordConfigured, verifyAdminPassword } from './password.ts'
import {
  ADMIN_ABSOLUTE_MS,
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

export type AdminJson = Record<string, unknown>

export type AdminRouteResult = {
  status: number
  body: AdminJson
  setCookie?: string | string[]
}

export type AdminRouteRequest = {
  method: string
  pathname: string
  cookieHeader?: string
  searchParams: URLSearchParams
  body: unknown
  userAgent?: string
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

function ok(body: AdminJson, setCookie?: string | string[]): AdminRouteResult {
  return { status: 200, body, setCookie }
}

function fail(
  status: number,
  message: string,
  setCookie?: string | string[],
): AdminRouteResult {
  return { status, body: { ok: false, message }, setCookie }
}

/** Vite·Vercel 공용 관리자/검사 DATA API 라우터 */
export async function handleAdminRoute(
  req: AdminRouteRequest,
): Promise<AdminRouteResult | null> {
  const method = req.method.toUpperCase()
  const { pathname, cookieHeader, searchParams } = req

  if (pathname === '/api/admin/login' && method === 'POST') {
    try {
      if (!isAdminPasswordConfigured()) {
        return fail(503, '관리자 비밀번호가 서버에 설정되지 않았습니다.')
      }
      const body = asRecord(req.body)
      const password = typeof body.password === 'string' ? body.password : ''
      if (!password.trim()) {
        return fail(400, '관리자 비밀번호를 입력해 주세요.')
      }
      const valid = await verifyAdminPassword(password)
      if (!valid) {
        return fail(401, '관리자 비밀번호가 올바르지 않습니다.')
      }
      const session = createSessionPayload()
      return ok(
        {
          ok: true,
          message: '관리자 모드로 로그인되었습니다.',
          expiresAt: session.exp,
        },
        buildSetCookieHeader(
          encodeSession(session),
          Math.floor(ADMIN_ABSOLUTE_MS / 1000),
        ),
      )
    } catch {
      return fail(500, '로그인 처리 중 오류가 발생했습니다.')
    }
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    return ok({ ok: true }, buildClearCookieHeader())
  }

  if (pathname === '/api/admin/session' && method === 'GET') {
    const token = readCookieValue(cookieHeader, ADMIN_SESSION_COOKIE)
    const payload = decodeSession(token)
    if (!isSessionValid(payload)) {
      return {
        status: 200,
        body: { authenticated: false },
        setCookie: token ? buildClearCookieHeader() : undefined,
      }
    }
    const refreshed = touchSession(payload)
    return ok(
      {
        authenticated: true,
        expiresAt: refreshed.exp,
        sessionId: refreshed.sid,
      },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
  }

  if (pathname === '/api/inspection-data/changes' && method === 'GET') {
    const auth = requireAdminFromCookie(cookieHeader)
    if (!auth.ok) {
      return fail(auth.status, auth.message)
    }
    const limit = Number(searchParams.get('limit') ?? '50')
    const items = await listChangeLogs(limit)
    const refreshed = touchSession(auth.session)
    return ok(
      { ok: true, items },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
  }

  const patchMatch = pathname.match(/^\/api\/inspection-data\/([^/]+)$/)
  if (patchMatch && method === 'PATCH') {
    const auth = requireAdminFromCookie(cookieHeader)
    if (!auth.ok) {
      return fail(auth.status, auth.message)
    }
    const id = decodeURIComponent(patchMatch[1] ?? '')
    if (!id) {
      return fail(400, '수정 대상 ID가 없습니다.')
    }
    const body = asRecord(req.body)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return fail(400, '수정 사유를 입력해 주세요.')
    }
    const before = asRecord(body.before)
    const after = asRecord(body.after)
    const fields = asStringArray(body.fields)
    const clientInfo = req.userAgent?.slice(0, 240) ?? 'unknown'
    const entry = await appendChangeLog({
      recordId: id,
      fields: fields.length > 0 ? fields : Object.keys(after),
      before,
      after,
      reason,
      sessionId: auth.session.sid,
      clientInfo,
      statusBefore: asStatus(body.statusBefore),
      statusAfter: asStatus(body.statusAfter),
    })
    const refreshed = touchSession(auth.session)
    return ok(
      {
        ok: true,
        changeId: entry.id,
        message:
          '검사 DATA가 수정되었습니다. 변경 내용이 전체 분석 메뉴에 반영되었습니다.',
      },
      buildSetCookieHeader(encodeSession(refreshed)),
    )
  }

  return null
}
