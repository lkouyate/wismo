/**
 * AES-256-GCM encryption/decryption for tokens stored in Firestore.
 *
 * Requires TOKEN_ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string containing: IV + ciphertext + auth tag.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Pack as: IV (12) + encrypted (variable) + authTag (16)
  const packed = Buffer.concat([iv, encrypted, authTag])
  return packed.toString('base64')
}

/**
 * Decrypt a token previously encrypted with encryptToken.
 * Returns the original plaintext string.
 */
export function decryptToken(packed64: string): string {
  const key = getKey()
  const packed = Buffer.from(packed64, 'base64')

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH)
  const encrypted = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Check if a value looks like it's already encrypted (base64 with minimum length).
 * Useful during migration to avoid double-encrypting.
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 40) return false
  try {
    const buf = Buffer.from(value, 'base64')
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1
  } catch {
    return false
  }
}
