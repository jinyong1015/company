#!/usr/bin/env node
/**
 * Usage: node scripts/hash-admin-password.mjs "your-password"
 * Output: ADMIN_PASSWORD_HASH=scrypt:...
 */
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const password = process.argv[2]

if (!password) {
  console.error('Usage: node scripts/hash-admin-password.mjs "your-password"')
  process.exit(1)
}

const salt = randomBytes(16)
const hash = await scryptAsync(password, salt, 64)
const serialized = `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`
console.log(`ADMIN_PASSWORD_HASH=${serialized}`)
