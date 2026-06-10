import bcrypt from 'bcryptjs'
import { db, now, newId, toSetting, type DbSetting, type DbUser } from './db'
import { encrypt, decrypt } from './crypto'

const BCRYPT_ROUNDS = 12

// ─── Access levels ────────────────────────────────────────────────────────────

export type AccessLevel = 'ADMIN' | 'EDITOR' | 'VIEWER'

const ACCESS_RANK: Record<AccessLevel, number> = { ADMIN: 3, EDITOR: 2, VIEWER: 1 }

export function rankOf(level: string): number {
  return ACCESS_RANK[level as AccessLevel] ?? 0
}

/**
 * Return the effective access level for a user.
 * Individual accessLevel > highest group membership level.
 */
export function getEffectiveAccessLevel(userId: string): AccessLevel {
  const user = db
    .prepare('SELECT "accessLevel" FROM "User" WHERE "id" = ?')
    .get(userId) as { accessLevel: string } | undefined
  if (!user) return 'VIEWER'

  // Workspace admins (no workspaceOwnerId) are always ADMIN regardless of stored value
  const owner = db
    .prepare('SELECT "workspaceOwnerId" FROM "User" WHERE "id" = ?')
    .get(userId) as { workspaceOwnerId: string | null } | undefined
  if (!owner?.workspaceOwnerId) return 'ADMIN'

  // Start with individual level
  let effective = user.accessLevel as AccessLevel

  // Check group memberships — highest wins
  const groupLevels = db.prepare(`
    SELECT COALESCE(m."accessLevel", g."accessLevel") AS level
    FROM "UserGroupMember" m
    JOIN "UserGroup" g ON g."id" = m."groupId"
    WHERE m."userId" = ?
  `).all(userId) as { level: string }[]

  for (const { level } of groupLevels) {
    if (rankOf(level) > rankOf(effective)) {
      effective = level as AccessLevel
    }
  }

  return effective
}

/**
 * Resolve the workspace owner's userId for a given user.
 * Workspace admins return their own ID; invited members return their owner's ID.
 * All resource DB queries should use this ID.
 */
export function resolveWorkspaceId(userId: string): string {
  const row = db
    .prepare('SELECT "workspaceOwnerId" FROM "User" WHERE "id" = ?')
    .get(userId) as { workspaceOwnerId: string | null } | undefined
  return row?.workspaceOwnerId ?? userId
}

/**
 * Check that a user has at least the required access level. Throws if not.
 */
export function assertAccess(userId: string, required: AccessLevel): void {
  const effective = getEffectiveAccessLevel(userId)
  if (rankOf(effective) < rankOf(required)) {
    throw new Error(`Forbidden: requires ${required} access`)
  }
}

// ─── Password ────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ─── Settings (encrypted key/value store) ────────────────────────────────────

export const SETTING_KEYS = {
  CF_API_TOKEN: 'cf_api_token',
  CF_ACCOUNT_ID: 'cf_account_id',
  /** @deprecated use CF_ZONES */
  CF_ZONE_ID: 'cf_zone_id',
  /** @deprecated use CF_ZONES */
  CF_ZONE_NAME: 'cf_zone_name',
  /** JSON array of { id: string, name: string } — replaces CF_ZONE_ID/CF_ZONE_NAME */
  CF_ZONES: 'cf_zones',
  SETUP_COMPLETE: 'setup_complete',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

const ENCRYPTED_KEYS = new Set<string>([SETTING_KEYS.CF_API_TOKEN])

/**
 * Build a scoped setting key for a specific user.
 * Format: "u:{userId}:{key}" — ensures per-user isolation.
 * Falls back to the bare key for backward compatibility with self-hosted setups.
 */
function scopedKey(key: SettingKey, userId?: string | null): string {
  if (userId) return `u:${userId}:${key}`
  return key
}

export async function getSetting(key: SettingKey, userId?: string | null): Promise<string | null> {
  // Try user-scoped key first
  const sk = scopedKey(key, userId)
  const row = db.prepare('SELECT * FROM "Setting" WHERE "key" = ?').get(sk) as Record<string, unknown> | undefined

  // Fall back to global/legacy key if no user-scoped entry found
  const effectiveRow = row ?? (
    userId
      ? db.prepare('SELECT * FROM "Setting" WHERE "key" = ?').get(key) as Record<string, unknown> | undefined
      : undefined
  )

  if (!effectiveRow) return null
  const setting = toSetting(effectiveRow)
  if (setting.encrypted) {
    try {
      return decrypt(setting.value)
    } catch {
      console.error(`Failed to decrypt setting: ${sk}`)
      return null
    }
  }
  return setting.value
}

export async function setSetting(key: SettingKey, value: string, userId?: string | null): Promise<DbSetting> {
  const sk = scopedKey(key, userId)
  const shouldEncrypt = ENCRYPTED_KEYS.has(key)
  const storedValue = shouldEncrypt ? encrypt(value) : value
  const ts = now()

  db.prepare(`
    INSERT INTO "Setting" ("id", "key", "value", "encrypted", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT("key") DO UPDATE SET
      "value"     = excluded."value",
      "encrypted" = excluded."encrypted",
      "updatedAt" = excluded."updatedAt"
  `).run(newId(), sk, storedValue, shouldEncrypt ? 1 : 0, ts, ts)

  return toSetting(
    db.prepare('SELECT * FROM "Setting" WHERE "key" = ?').get(sk) as Record<string, unknown>
  )
}

export async function deleteSetting(key: SettingKey, userId?: string | null): Promise<void> {
  db.prepare('DELETE FROM "Setting" WHERE "key" = ?').run(scopedKey(key, userId))
}

export async function getAllSettings(userId?: string | null): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {}

  if (userId) {
    const prefix = `u:${userId}:`

    // 1. Load global/legacy settings first (lower priority)
    const globalRows = db
      .prepare('SELECT * FROM "Setting" WHERE "key" NOT LIKE ?')
      .all('u:%') as Record<string, unknown>[]
    for (const rawRow of globalRows) {
      const row = toSetting(rawRow)
      result[row.key] = row.encrypted ? '[ENCRYPTED]' : row.value
    }

    // 2. Overlay with user-scoped settings (higher priority — overwrite globals)
    const userRows = db
      .prepare('SELECT * FROM "Setting" WHERE "key" LIKE ?')
      .all(`${prefix}%`) as Record<string, unknown>[]
    for (const rawRow of userRows) {
      const row = toSetting(rawRow)
      const bareKey = row.key.slice(prefix.length)
      result[bareKey] = row.encrypted ? '[ENCRYPTED]' : row.value
    }

    return result
  }

  // Legacy: global settings only (no userId prefix)
  const rows = db
    .prepare('SELECT * FROM "Setting" WHERE "key" NOT LIKE ?')
    .all('u:%') as Record<string, unknown>[]
  for (const rawRow of rows) {
    const row = toSetting(rawRow)
    result[row.key] = row.encrypted ? '[ENCRYPTED]' : row.value
  }
  return result
}

export async function isSetupComplete(userId?: string | null): Promise<boolean> {
  const val = await getSetting(SETTING_KEYS.SETUP_COMPLETE, userId)
  return val === 'true'
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function audit(params: {
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, unknown>
  /** Snapshot of the resource state BEFORE the change (for diff view) */
  before?: Record<string, unknown>
  /** Snapshot of the resource state AFTER the change (for diff view) */
  after?: Record<string, unknown>
  userId?: string
  ipAddress?: string
}): Promise<void> {
  try {
    db.prepare(`
      INSERT INTO "AuditLog" ("id", "action", "resource", "resourceId", "details", "before", "after", "userId", "ipAddress", "createdAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId(),
      params.action,
      params.resource,
      params.resourceId ?? null,
      params.details ? JSON.stringify(params.details) : null,
      params.before ? JSON.stringify(params.before) : null,
      params.after ? JSON.stringify(params.after) : null,
      params.userId ?? null,
      params.ipAddress ?? null,
      now(),
    )
  } catch (err) {
    // Audit log failure should never crash the main flow
    console.error('[audit] Failed to write audit log:', err)
  }
}
