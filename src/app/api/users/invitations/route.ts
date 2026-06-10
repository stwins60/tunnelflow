/**
 * GET  /api/users/invitations  — list pending invitations for the workspace
 * POST /api/users/invitations  — create and send an invitation
 */

import { NextRequest } from 'next/server'
import { db, now, newId } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, err, unauthorized, serverError } from '@/lib/api-helpers'
import type { DbUserInvitation } from '@/lib/db'

const INVITE_TTL_DAYS = 7

export async function GET() {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)

    const invitations = db.prepare(`
      SELECT i.*, u."email" AS inviterEmail
      FROM "UserInvitation" i
      JOIN "User" u ON u."id" = i."invitedBy"
      WHERE i."invitedBy" = ? OR u."workspaceOwnerId" = ?
      ORDER BY i."createdAt" DESC
    `).all(workspaceId, workspaceId) as (DbUserInvitation & { inviterEmail: string })[]

    return ok({ invitations })
  } catch (e) {
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const { email, accessLevel = 'VIEWER', groupId = null } = await req.json() as {
      email?: string
      accessLevel?: string
      groupId?: string | null
    }

    if (!email?.trim()) return err('email is required', 422)
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(accessLevel)) {
      return err('accessLevel must be ADMIN, EDITOR, or VIEWER', 422)
    }

    // Check the email doesn't already have an account
    const existingUser = db.prepare(`SELECT "id" FROM "User" WHERE lower("email") = lower(?)`).get(email)
    if (existingUser) return err('A user with this email already exists.', 409)

    // Check for existing pending invite for same email
    const existingInvite = db.prepare(`
      SELECT "id" FROM "UserInvitation" WHERE lower("email") = lower(?) AND "acceptedAt" IS NULL AND "invitedBy" = ?
    `).get(email, session.userId)
    if (existingInvite) return err('A pending invite already exists for this email.', 409)

    // Validate group belongs to workspace if specified
    if (groupId) {
      const workspaceId = resolveWorkspaceId(session.userId)
      const group = db.prepare(`SELECT "id" FROM "UserGroup" WHERE "id" = ? AND "ownerId" = ?`).get(groupId, workspaceId)
      if (!group) return err('Group not found.', 404)
    }

    const token     = newId().replace(/-/g, '') + newId().replace(/-/g, '') // 64-char hex token
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000).toISOString()
    const ts        = now()
    const id        = newId()

    db.prepare(`
      INSERT INTO "UserInvitation" ("id","email","invitedBy","groupId","accessLevel","token","expiresAt","acceptedAt","createdAt")
      VALUES (?,?,?,?,?,?,?,NULL,?)
    `).run(id, email.trim().toLowerCase(), session.userId, groupId, accessLevel, token, expiresAt, ts)

    const invite = db.prepare(`SELECT * FROM "UserInvitation" WHERE "id" = ?`).get(id) as DbUserInvitation

    return ok({ invite, inviteUrl: `/invite?token=${token}` }, 201)
  } catch (e) {
    return serverError(e)
  }
}
