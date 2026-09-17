import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

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

/**
 * 서버 환경변수 ADMIN_PASSWORD_HASH(scrypt)만으로 검증한다.
 * 평문 ADMIN_PASSWORD는 사용하지 않는다.
 * 비밀번호·해시는 프런트엔드 번들·공개 API 응답에 포함되면 안 된다.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || !password.trim()) return false

  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim()
  if (!configuredHash) return false

  const parts = parsePasswordHash(configuredHash)
  if (!parts) return false

  const derived = await hashWithSalt(password, parts.salt)
  return safeEqual(derived, parts.hash)
}

export function isAdminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH?.trim())
}
