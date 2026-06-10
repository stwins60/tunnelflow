/**
 * SQLite database singleton using better-sqlite3.
 * Schema is initialised on first connection — no external migration tool needed.
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string
  email: string
  password: string
  role: string
  /** ADMIN | EDITOR | VIEWER — effective access level within the workspace */
  accessLevel: string
  /** userId of the workspace owner this user belongs to (null = they are the owner) */
  workspaceOwnerId: string | null
  /** userId who invited this user */
  invitedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface DbSetting {
  id: string
  key: string
  value: string
  encrypted: boolean
  createdAt: string
  updatedAt: string
}

export interface DbTunnel {
  id: string
  cfTunnelId: string
  name: string
  accountId: string
  status: string
  userId: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DbTunnelWithServers extends DbTunnel {
  servers: DbServer[]
}

export interface DbServer {
  id: string
  name: string
  subdomain: string
  upstream: string
  protocol: string
  tunnelId: string | null
  dnsRecordId: string | null
  /** Cloudflare zone ID this server's DNS record belongs to */
  zoneId: string | null
  userId: string | null
  status: string
  notes: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DbServerWithTunnel extends DbServer {
  tunnel: Pick<DbTunnel, 'id' | 'name' | 'cfTunnelId' | 'status'> | null
}

export interface DbUserGroup {
  id: string
  ownerId: string       // workspace admin who created the group
  name: string
  description: string | null
  accessLevel: string   // default ADMIN | EDITOR | VIEWER for members
  createdAt: string
  updatedAt: string
}

export interface DbUserGroupMember {
  id: string
  groupId: string
  userId: string
  /** Optional per-member override; uses group accessLevel when null */
  accessLevel: string | null
  createdAt: string
}

export interface DbUserInvitation {
  id: string
  email: string
  invitedBy: string     // userId of inviter
  groupId: string | null
  /** Access level granted on acceptance; overrides group default when set */
  accessLevel: string
  token: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface DbNotificationChannel {
  id: string
  userId: string
  type: string        // 'smtp' | 'slack' | 'discord' | 'telegram'
  name: string
  config: string      // JSON, sensitive fields AES-256-GCM encrypted
  enabled: boolean
  events: string      // JSON array of NotificationEvent strings
  lastTestedAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface DbAuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  details: string | null
  /** JSON snapshot of the resource before the change */
  before: string | null
  /** JSON snapshot of the resource after the change */
  after: string | null
  userId: string | null
  ipAddress: string | null
  createdAt: string
}

export interface DbAuditLogWithUser extends DbAuditLog {
  user: { email: string } | null
}

export interface DbApiKey {
  id: string
  userId: string   // workspace owner
  name: string
  keyHash: string  // SHA-256 hex of the raw key
  prefix: string   // first 12 chars of raw key for display (tfk_XXXXXXXX)
  scopes: string   // JSON array: 'read' | 'write' | 'deploy' | 'admin'
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface DbHealthCheck {
  id: string
  serverId: string
  status: string      // 'up' | 'down' | 'timeout' | 'error'
  statusCode: number | null
  responseMs: number | null
  error: string | null
  checkedAt: string
}

export interface DbServerTemplate {
  id: string
  userId: string
  name: string
  description: string | null
  protocol: string
  upstreamPattern: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface DbMaintenanceWindow {
  id: string
  serverId: string
  userId: string
  title: string
  startsAt: string
  endsAt: string
  recurring: boolean
  /** 'daily' | 'weekly' | null */
  recurrence: string | null
  createdAt: string
  updatedAt: string
}

export interface DbCloudflareAccount {
  id: string
  userId: string
  name: string
  accountId: string   // CF account ID
  apiToken: string    // AES-256-GCM encrypted
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL ?? 'file:/data/tunnel-manager.db'
const DB_PATH = DB_URL.replace(/^file:/, '')

// Ensure directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const globalForDb = globalThis as unknown as { _db: Database.Database | undefined }

function createDb(): Database.Database {
  const instance = new Database(DB_PATH)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  initSchema(instance)
  migrateSchema(instance)
  return instance
}

export const db: Database.Database = globalForDb._db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb._db = db
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function initSchema(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id"               TEXT NOT NULL PRIMARY KEY,
      "email"            TEXT NOT NULL UNIQUE,
      "password"         TEXT NOT NULL,
      "role"             TEXT NOT NULL DEFAULT 'ADMIN',
      "accessLevel"      TEXT NOT NULL DEFAULT 'ADMIN',
      "workspaceOwnerId" TEXT,
      "invitedBy"        TEXT,
      "createdAt"        TEXT NOT NULL,
      "updatedAt"        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "Setting" (
      "id"        TEXT NOT NULL PRIMARY KEY,
      "key"       TEXT NOT NULL UNIQUE,
      "value"     TEXT NOT NULL,
      "encrypted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "Tunnel" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "cfTunnelId" TEXT NOT NULL UNIQUE,
      "name"       TEXT NOT NULL,
      "accountId"  TEXT NOT NULL,
      "status"     TEXT NOT NULL DEFAULT 'inactive',
      "lastSyncAt" TEXT,
      "createdAt"  TEXT NOT NULL,
      "updatedAt"  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "Server" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "name"        TEXT NOT NULL,
      "subdomain"   TEXT NOT NULL UNIQUE,
      "upstream"    TEXT NOT NULL,
      "protocol"    TEXT NOT NULL DEFAULT 'http',
      "tunnelId"    TEXT,
      "dnsRecordId" TEXT,
      "zoneId"      TEXT,
      "status"      TEXT NOT NULL DEFAULT 'pending',
      "notes"       TEXT,
      "lastSyncAt"  TEXT,
      "createdAt"   TEXT NOT NULL,
      "updatedAt"   TEXT NOT NULL,
      FOREIGN KEY ("tunnelId") REFERENCES "Tunnel"("id") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "action"     TEXT NOT NULL,
      "resource"   TEXT NOT NULL,
      "resourceId" TEXT,
      "details"    TEXT,
      "before"     TEXT,
      "after"      TEXT,
      "userId"     TEXT,
      "ipAddress"  TEXT,
      "createdAt"  TEXT NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "NotificationChannel" (
      "id"           TEXT NOT NULL PRIMARY KEY,
      "userId"       TEXT NOT NULL,
      "type"         TEXT NOT NULL,
      "name"         TEXT NOT NULL,
      "config"       TEXT NOT NULL DEFAULT '{}',
      "enabled"      INTEGER NOT NULL DEFAULT 1,
      "events"       TEXT NOT NULL DEFAULT '[]',
      "lastTestedAt" TEXT,
      "lastErrorAt"  TEXT,
      "lastError"    TEXT,
      "createdAt"    TEXT NOT NULL,
      "updatedAt"    TEXT NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "UserGroup" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "ownerId"     TEXT NOT NULL,
      "name"        TEXT NOT NULL,
      "description" TEXT,
      "accessLevel" TEXT NOT NULL DEFAULT 'VIEWER',
      "createdAt"   TEXT NOT NULL,
      "updatedAt"   TEXT NOT NULL,
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "UserGroupMember" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "groupId"     TEXT NOT NULL,
      "userId"      TEXT NOT NULL,
      "accessLevel" TEXT,
      "createdAt"   TEXT NOT NULL,
      UNIQUE("groupId", "userId"),
      FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId")  REFERENCES "User"("id")      ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "UserInvitation" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "email"       TEXT NOT NULL,
      "invitedBy"   TEXT NOT NULL,
      "groupId"     TEXT,
      "accessLevel" TEXT NOT NULL DEFAULT 'VIEWER',
      "token"       TEXT NOT NULL UNIQUE,
      "expiresAt"   TEXT NOT NULL,
      "acceptedAt"  TEXT,
      "createdAt"   TEXT NOT NULL,
      FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("groupId")   REFERENCES "UserGroup"("id") ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS "ApiKey" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "userId"     TEXT NOT NULL,
      "name"       TEXT NOT NULL,
      "keyHash"    TEXT NOT NULL UNIQUE,
      "prefix"     TEXT NOT NULL,
      "scopes"     TEXT NOT NULL DEFAULT '["read"]',
      "expiresAt"  TEXT,
      "lastUsedAt" TEXT,
      "revokedAt"  TEXT,
      "createdAt"  TEXT NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "HealthCheck" (
      "id"          TEXT NOT NULL PRIMARY KEY,
      "serverId"    TEXT NOT NULL,
      "status"      TEXT NOT NULL,
      "statusCode"  INTEGER,
      "responseMs"  INTEGER,
      "error"       TEXT,
      "checkedAt"   TEXT NOT NULL,
      FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "ServerTemplate" (
      "id"              TEXT NOT NULL PRIMARY KEY,
      "userId"          TEXT NOT NULL,
      "name"            TEXT NOT NULL,
      "description"     TEXT,
      "protocol"        TEXT NOT NULL DEFAULT 'http',
      "upstreamPattern" TEXT,
      "notes"           TEXT,
      "createdAt"       TEXT NOT NULL,
      "updatedAt"       TEXT NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "MaintenanceWindow" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "serverId"   TEXT NOT NULL,
      "userId"     TEXT NOT NULL,
      "title"      TEXT NOT NULL,
      "startsAt"   TEXT NOT NULL,
      "endsAt"     TEXT NOT NULL,
      "recurring"  INTEGER NOT NULL DEFAULT 0,
      "recurrence" TEXT,
      "createdAt"  TEXT NOT NULL,
      "updatedAt"  TEXT NOT NULL,
      FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId")   REFERENCES "User"("id")   ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "CloudflareAccount" (
      "id"        TEXT NOT NULL PRIMARY KEY,
      "userId"    TEXT NOT NULL,
      "name"      TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "apiToken"  TEXT NOT NULL,
      "isPrimary" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `)
}

// ─── Migrations ───────────────────────────────────────────────────────────────

/**
 * Additive migrations applied after CREATE TABLE IF NOT EXISTS.
 * Each ALTER TABLE is wrapped in a try/catch so re-running is safe.
 */
function migrateSchema(instance: Database.Database): void {
  // v2: add zoneId column to Server (multi-zone support)
  try {
    instance.exec(`ALTER TABLE "Server" ADD COLUMN "zoneId" TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }

  // v3: add userId to Tunnel and Server (SaaS multi-tenancy)
  try {
    instance.exec(`ALTER TABLE "Tunnel" ADD COLUMN "userId" TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    instance.exec(`ALTER TABLE "Server" ADD COLUMN "userId" TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }

  // v4: add accessLevel, workspaceOwnerId, invitedBy to User (multi-user invitations)
  try { instance.exec(`ALTER TABLE "User" ADD COLUMN "accessLevel" TEXT NOT NULL DEFAULT 'ADMIN'`) } catch { /* exists */ }
  try { instance.exec(`ALTER TABLE "User" ADD COLUMN "workspaceOwnerId" TEXT`) }                    catch { /* exists */ }
  try { instance.exec(`ALTER TABLE "User" ADD COLUMN "invitedBy" TEXT`) }                           catch { /* exists */ }

  // v5: add before/after diff columns to AuditLog
  try { instance.exec(`ALTER TABLE "AuditLog" ADD COLUMN "before" TEXT`) } catch { /* exists */ }
  try { instance.exec(`ALTER TABLE "AuditLog" ADD COLUMN "after" TEXT`) }  catch { /* exists */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function now(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Coerce SQLite integer booleans to JS booleans on Setting rows */
export function toSetting(row: Record<string, unknown>): DbSetting {
  return { ...row, encrypted: Boolean(row.encrypted) } as DbSetting
}

export default db
