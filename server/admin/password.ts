import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseConfig.ts'

const scryptAsync = promisify(scrypt)

const SCRYPT_KEYLEN = 64
const HASH_PREFIX = 'scrypt'

export type PasswordHashParts = {
  salt: Buffer
  hash: Buffer
}

export function serializePasswordHash(parts: PasswordHashParts): string {
  return `${HASH_PREFIX}:${parts.salt.toString('base64')}:${parts.hash.toString('base64')}`
}

export function parsePasswordHash(serialized: string): PasswordHashParts | null {
  const [prefix, saltB64, hashB64] = serialized.split(':')
  if (prefix !== HASH_PREFIX || !saltB64 || !hashB64) return null
  try {
    return {
      salt: Buffer.from(saltB64, 'base64'),
      hash: Buffer.from(hashB64, 'base64'),
    }
  } catch {
    return null
  }
}

export async function hashPassword(password: string, salt?: Buffer): Promise<string> {
  const usedSalt = salt ?? randomBytes(16)
  const derived = (await scryptAsync(password, usedSalt, SCRYPT_KEYLEN)) as Buffer
  return serializePasswordHash({ salt: usedSalt, hash: derived })
}

async function hashWithSalt(password: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function verifyViaSupabase(password: string): Promise<boolean | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_admin_password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_password: password }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[admin-auth] supabase verify failed', res.status, text.slice(0, 200))
      return null
    }
    const data = (await res.json()) as unknown
    return data === true
  } catch (err) {
    console.warn('[admin-auth] supabase verify error', err)
    return null
  }
}

async function verifyViaEnvHash(password: string): Promise<boolean> {
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim()
  if (!configuredHash) return false

  const parts = parsePasswordHash(configuredHash)
  if (!parts) return false

  const derived = await hashWithSalt(password, parts.salt)
  return safeEqual(derived, parts.hash)
}

/**
 * 관리자 비밀번호 검증.
 * 1) Supabase RPC `verify_admin_password` (우선)
 * 2) 환경변수 ADMIN_PASSWORD_HASH (폴백)
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || !password.trim()) return false

  const supabaseResult = await verifyViaSupabase(password)
  if (supabaseResult === true) return true
  if (supabaseResult === false) return false

  return verifyViaEnvHash(password)
}

export function isAdminPasswordConfigured(): boolean {
  // Supabase 기본 설정이 있으면 항상 로그인 시도 가능
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return true
  return Boolean(process.env.ADMIN_PASSWORD_HASH?.trim())
}
