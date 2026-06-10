/**
 * API key management for TunnelFlow.
 * Keys have the format:  tfk_<32-char-hex-random>
 * Only the SHA-256 hash is stored in the DB; the raw key is returned once on creation.
 */

import crypto from 'crypto'
import { db, now, newId, type DbApiKey } from './db'

export type ApiKeyScope = 'read' | 'write' | 'deploy' | 'admin'

export const ALL_SCOPES: ApiKeyScope[] = ['read', 'write', 'deploy', 'admin']

/** Generate a new raw API key. The prefix (first 16 chars) is stored for display. */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(32).toString('hex') // 64 hex chars
  const raw = `tfk_${random}`
  const prefix = raw.slice(0, 16) // "tfk_" + 12 chars
  const hash = hashApiKey(raw)
  return { raw, prefix, hash }
}

/** SHA-256 hash of a raw API key (hex). */
export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Look up an API key row by the raw key value. Returns null if not found/revoked/expired. */
export function resolveApiKey(raw: string): DbApiKey | null {
  const hash = hashApiKey(raw)
  const row = db
    .prepare('SELECT * FROM "ApiKey" WHERE "keyHash" = ? AND "revokedAt" IS NULL')
    .get(hash) as DbApiKey | undefined

  if (!row) return null

  // Check expiry
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null

  // Update lastUsedAt (fire-and-forget, non-critical)
  try {
    db.prepare('UPDATE "ApiKey" SET "lastUsedAt" = ? WHERE "id" = ?').run(now(), row.id)
  } catch {
    // ignore
  }

  return row
}

/** Check whether an API key has a given scope. */
export function hasScope(key: DbApiKey, scope: ApiKeyScope): boolean {
  try {
    const scopes: string[] = JSON.parse(key.scopes)
    // 'admin' scope implies all others
    if (scopes.includes('admin')) return true
    return scopes.includes(scope)
  } catch {
    return false
  }
}

/** Assert that an API key has the required scope; throws if not. */
export function assertScope(key: DbApiKey, scope: ApiKeyScope): void {
  if (!hasScope(key, scope)) {
    throw new Error(`API key missing required scope: ${scope}`)
  }
}

/** Create a new API key. Returns the row AND the raw key (shown once). */
export function createApiKey(params: {
  userId: string
  name: string
  scopes: ApiKeyScope[]
  expiresAt?: string | null
}): { row: DbApiKey; rawKey: string } {
  const { raw, prefix, hash } = generateApiKey()
  const ts = now()
  const id = newId()

  db.prepare(`
    INSERT INTO "ApiKey" ("id", "userId", "name", "keyHash", "prefix", "scopes", "expiresAt", "createdAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    params.name,
    hash,
    prefix,
    JSON.stringify(params.scopes),
    params.expiresAt ?? null,
    ts,
  )

  const row = db.prepare('SELECT * FROM "ApiKey" WHERE "id" = ?').get(id) as DbApiKey
  return { row, rawKey: raw }
}

/** List all non-revoked API keys for a workspace owner. */
export function listApiKeys(userId: string): DbApiKey[] {
  return db
    .prepare('SELECT * FROM "ApiKey" WHERE "userId" = ? ORDER BY "createdAt" DESC')
    .all(userId) as DbApiKey[]
}

/** Revoke an API key by ID. Returns false if not found or not owned by userId. */
export function revokeApiKey(id: string, userId: string): boolean {
  const result = db
    .prepare('UPDATE "ApiKey" SET "revokedAt" = ? WHERE "id" = ? AND "userId" = ? AND "revokedAt" IS NULL')
    .run(now(), id, userId)
  return result.changes > 0
}
