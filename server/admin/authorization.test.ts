import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_SESSION_COOKIE,
  createSessionPayload,
  decodeSession,
  encodeSession,
  requireAdminFromCookie,
  requireStaffFromCookie,
  type AdminSessionPayload,
  type AuthRole,
} from './session.ts'
import { handleAdminRoute } from './routes.ts'

process.env.ADMIN_SESSION_SECRET = 'test-only-session-secret-that-is-long'
process.env.NODE_ENV = 'test'

function cookieFor(role: AuthRole) {
  return `${ADMIN_SESSION_COOKIE}=${encodeSession(createSessionPayload(role))}`
}

test('all four explicit roles survive a signed cookie round trip', () => {
  for (const role of ['user', 'manager', 'admin', 'vina'] satisfies AuthRole[]) {
    const payload = createSessionPayload(role)
    assert.equal(decodeSession(encodeSession(payload))?.role, role)
  }
})

test('legacy role-less cookies are rejected instead of becoming admin', () => {
  const legacy = {
    ...createSessionPayload('admin'),
    role: undefined,
  } as unknown as AdminSessionPayload
  assert.equal(decodeSession(encodeSession(legacy)), null)
})

test('inspection DATA admin guard rejects every non-admin role', () => {
  assert.equal(requireAdminFromCookie(cookieFor('admin')).ok, true)
  for (const role of ['user', 'manager', 'vina'] satisfies AuthRole[]) {
    const result = requireAdminFromCookie(cookieFor(role))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 403)
  }
})

test('legacy staff guard only accepts manager and admin', () => {
  assert.equal(requireStaffFromCookie(cookieFor('manager')).ok, true)
  assert.equal(requireStaffFromCookie(cookieFor('admin')).ok, true)
  assert.equal(requireStaffFromCookie(cookieFor('user')).ok, false)
  assert.equal(requireStaffFromCookie(cookieFor('vina')).ok, false)
})

test('basic user login issues an explicit signed user session without password', async () => {
  const result = await handleAdminRoute({
    method: 'POST',
    pathname: '/api/admin/login',
    searchParams: new URLSearchParams(),
    body: { role: 'user', password: '' },
  })

  assert.equal(result?.status, 200)
  assert.equal(result?.body.role, 'user')
  assert.equal(typeof result?.setCookie, 'string')
  const token = String(result?.setCookie)
    .split(';')[0]
    ?.split('=')[1]
  assert.equal(decodeSession(token)?.role, 'user')
})
