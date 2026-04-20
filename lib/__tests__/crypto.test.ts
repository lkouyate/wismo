import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken, isEncrypted } from '@/lib/crypto'

beforeAll(() => {
  // Set a test encryption key (32 bytes = 64 hex chars)
  process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('crypto', () => {
  it('encrypts and decrypts a token correctly', () => {
    const original = 'ya29.a0AfH6SMB-some-google-access-token'
    const encrypted = encryptToken(original)
    expect(encrypted).not.toBe(original)
    expect(decryptToken(encrypted)).toBe(original)
  })

  it('produces different ciphertext for the same input', () => {
    const token = 'refresh-token-value'
    const a = encryptToken(token)
    const b = encryptToken(token)
    expect(a).not.toBe(b) // Random IV means different ciphertext
    expect(decryptToken(a)).toBe(token)
    expect(decryptToken(b)).toBe(token)
  })

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptToken('secret')
    const tampered = encrypted.slice(0, -2) + 'XX'
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('handles empty string', () => {
    const encrypted = encryptToken('')
    expect(decryptToken(encrypted)).toBe('')
  })

  it('handles unicode', () => {
    const token = 'tökèn-with-üñîcödé-chars'
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  describe('isEncrypted', () => {
    it('detects encrypted values', () => {
      const encrypted = encryptToken('test')
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('rejects plain tokens', () => {
      expect(isEncrypted('ya29.short-token')).toBe(false)
      expect(isEncrypted('')).toBe(false)
    })
  })
})
