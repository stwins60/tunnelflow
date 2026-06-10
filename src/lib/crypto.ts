/**
 * AES-256-GCM encryption/decryption utilities.
 * Used to encrypt Cloudflare credentials before persisting to the database.
 *
 * SECURITY: The ENCRYPTION_KEY env var must be set before any sensitive data
 * is stored. If it changes, existing encrypted values will be unreadable.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag
const SALT_LENGTH = 16

function deriveKey(secret: string, salt: Buffer): Buffer {
  // scrypt KDF: N=16384, r=8, p=1 → 32 bytes
  return scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 })
}

function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set or is too short. ' +
      'Generate one with: openssl rand -hex 32'
    )
  }
  return key
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing: salt + iv + tag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const secret = getSecret()
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = deriveKey(secret, salt)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Combine: [salt(16)] [iv(12)] [tag(16)] [ciphertext]
  const combined = Buffer.concat([salt, iv, tag, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypt a value previously encrypted with `encrypt()`.
 * Throws on tampered/invalid data.
 */
export function decrypt(ciphertext: string): string {
  const secret = getSecret()
  const combined = Buffer.from(ciphertext, 'base64')

  if (combined.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted value is too short — data may be corrupt.')
  }

  const salt = combined.subarray(0, SALT_LENGTH)
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(secret, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Redact secrets from strings/objects for safe logging.
 * Replaces known sensitive patterns with [REDACTED].
 */
export function redactSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [REDACTED]')
      .replace(/(token|secret|password|key|credential)["\s:=]+[^\s"&,}]*/gi, '$1=[REDACTED]')
  }
  if (typeof input === 'object' && input !== null) {
    const sensitiveKeys = new Set([
      'token', 'secret', 'password', 'api_token', 'apiToken',
      'apiKey', 'api_key', 'credential', 'credentials', 'authorization',
    ])
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      result[k] = sensitiveKeys.has(k.toLowerCase()) ? '[REDACTED]' : redactSecrets(v)
    }
    return result
  }
  return input
}
