/**
 * POST /api/auth/register
 *
 * Two modes:
 *  1. First user (no users in DB) — free sign-up, becomes workspace ADMIN.
 *  2. Subsequent users — must supply a valid invite token.
 *     They join the inviter's workspace as EDITOR/VIEWER; no CF credentials needed.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now, newId } from '@/lib/db'
import { hashPassword, setSetting, SETTING_KEYS, audit, getEffectiveAccessLevel } from '@/lib/auth'
import { verifyToken } from '@/lib/cloudflare/client'
import { getZone } from '@/lib/cloudflare/zones'
import { ok, err, serverError, getClientIp } from '@/lib/api-helpers'
import { getSession } from '@/lib/session'
import type { DbUser, DbUserInvitation } from '@/lib/db'

// ─── Schema for first admin registration ──────────────────────────────────────

const adminSchema = z.object({
  email:     z.string().email('Invalid email address'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  apiToken:  z.string().min(1, 'API token is required'),
  accountId: z.string().min(1, 'Account ID is required'),
  zoneIds:   z.array(z.string().min(1)).min(1, 'At least one zone is required'),
})

// ─── Schema for invite-based registration ─────────────────────────────────────

const inviteSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  token:    z.string().min(1, 'Invite token is required'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ip   = getClientIp(request)

    // ── Determine if this is the first user ───────────────────────────────────
    const userCount = (db.prepare('SELECT COUNT(*) AS n FROM "User"').get() as { n: number }).n
    const isFirstUser = userCount === 0

    if (isFirstUser) {
      return await handleAdminRegister(body, ip)
    } else {
      return await handleInviteRegister(body, ip)
    }
  } catch (e) {
    return serverError(e)
  }
}

// ─── Admin (first user) registration ─────────────────────────────────────────

async function handleAdminRegister(body: unknown, ip: string) {
  const parsed = adminSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
  }

  const { email, password, apiToken, accountId, zoneIds } = parsed.data

  const existingUser = db.prepare('SELECT "id" FROM "User" WHERE "email" = ?').get(email)
  if (existingUser) return err('An account with this email already exists.', 409)

  const verification = await verifyToken(apiToken)
  if (!verification.valid) {
    return err('Cloudflare API token is invalid or inactive.', 422, 'INVALID_TOKEN')
  }

  const zones: { id: string; name: string }[] = []
  for (const zoneId of zoneIds) {
    try {
      const zone = await getZone(zoneId, apiToken)
      zones.push({ id: zoneId, name: zone.name })
    } catch {
      return err(`API token does not have access to zone "${zoneId}".`, 422, 'ZONE_ACCESS_DENIED')
    }
  }

  const hashedPassword = await hashPassword(password)
  const ts     = now()
  const userId = newId()

  db.prepare(`
    INSERT INTO "User" ("id", "email", "password", "role", "accessLevel", "workspaceOwnerId", "invitedBy", "createdAt", "updatedAt")
    VALUES (?, ?, ?, 'ADMIN', 'ADMIN', NULL, NULL, ?, ?)
  `).run(userId, email, hashedPassword, ts, ts)

  const user = db.prepare('SELECT * FROM "User" WHERE "id" = ?').get(userId) as DbUser

  await setSetting(SETTING_KEYS.CF_API_TOKEN, apiToken, userId)
  await setSetting(SETTING_KEYS.CF_ACCOUNT_ID, accountId, userId)
  await setSetting(SETTING_KEYS.CF_ZONES, JSON.stringify(zones), userId)
  await setSetting(SETTING_KEYS.CF_ZONE_ID, zones[0].id, userId)
  await setSetting(SETTING_KEYS.CF_ZONE_NAME, zones[0].name, userId)
  await setSetting(SETTING_KEYS.SETUP_COMPLETE, 'true', userId)

  await audit({ action: 'REGISTER', resource: 'user', resourceId: user.id, details: { accountId, zones }, userId: user.id, ipAddress: ip })

  const session = await getSession()
  session.userId      = user.id
  session.email       = user.email
  session.role        = 'ADMIN'
  session.accessLevel = 'ADMIN'
  session.isLoggedIn  = true
  await session.save()

  return ok({ message: 'Account created', zones }, 201)
}

// ─── Invite-based registration ────────────────────────────────────────────────

async function handleInviteRegister(body: unknown, ip: string) {
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
  }

  const { email, password, token } = parsed.data

  // Validate invite token
  const invite = db
    .prepare(`SELECT * FROM "UserInvitation" WHERE "token" = ? AND "acceptedAt" IS NULL`)
    .get(token) as DbUserInvitation | undefined

  if (!invite) return err('Invite link is invalid or has already been used.', 400, 'INVALID_INVITE')
  if (new Date(invite.expiresAt) < new Date()) return err('This invite link has expired.', 400, 'INVITE_EXPIRED')
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    return err('This invite was sent to a different email address.', 400, 'EMAIL_MISMATCH')
  }

  const existingUser = db.prepare('SELECT "id" FROM "User" WHERE "email" = ?').get(email)
  if (existingUser) return err('An account with this email already exists.', 409)

  // Resolve workspace owner from inviter
  const inviter = db.prepare('SELECT "id", "workspaceOwnerId" FROM "User" WHERE "id" = ?').get(invite.invitedBy) as
    { id: string; workspaceOwnerId: string | null } | undefined
  if (!inviter) return err('Inviter account no longer exists.', 400)
  const workspaceOwnerId = inviter.workspaceOwnerId ?? inviter.id

  const hashedPassword = await hashPassword(password)
  const ts     = now()
  const userId = newId()

  db.prepare(`
    INSERT INTO "User" ("id", "email", "password", "role", "accessLevel", "workspaceOwnerId", "invitedBy", "createdAt", "updatedAt")
    VALUES (?, ?, ?, 'VIEWER', ?, ?, ?, ?, ?)
  `).run(userId, email, hashedPassword, invite.accessLevel, workspaceOwnerId, invite.invitedBy, ts, ts)

  // Add to group if invite specified one
  if (invite.groupId) {
    db.prepare(`
      INSERT OR IGNORE INTO "UserGroupMember" ("id", "groupId", "userId", "accessLevel", "createdAt")
      VALUES (?, ?, ?, NULL, ?)
    `).run(newId(), invite.groupId, userId, ts)
  }

  // Mark invite as accepted
  db.prepare(`UPDATE "UserInvitation" SET "acceptedAt" = ? WHERE "id" = ?`).run(ts, invite.id)

  const user = db.prepare('SELECT * FROM "User" WHERE "id" = ?').get(userId) as DbUser

  await audit({ action: 'REGISTER_INVITE', resource: 'user', resourceId: user.id, details: { inviteId: invite.id }, userId: user.id, ipAddress: ip })

  const session = await getSession()
  session.userId      = user.id
  session.email       = user.email
  session.role        = 'VIEWER'
  session.accessLevel = getEffectiveAccessLevel(userId)
  session.isLoggedIn  = true
  await session.save()

  return ok({ message: 'Account created' }, 201)
}
