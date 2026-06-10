/**
 * GET  /api/users  — list all users in the caller's workspace (admin only)
 */

import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { db } from '@/lib/db'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

export async function GET() {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)

    // Workspace owner + all users whose workspaceOwnerId points here
    const users = db.prepare(`
      SELECT "id", "email", "role", "accessLevel", "workspaceOwnerId", "invitedBy", "createdAt", "updatedAt"
      FROM "User"
      WHERE "id" = ? OR "workspaceOwnerId" = ?
      ORDER BY "createdAt" ASC
    `).all(workspaceId, workspaceId) as Omit<DbUser, 'password'>[]

    // Attach group memberships
    const withGroups = users.map((u) => {
      const groups = db.prepare(`
        SELECT g."id", g."name", g."accessLevel" AS groupAccessLevel,
               m."accessLevel" AS memberAccessLevel
        FROM "UserGroupMember" m
        JOIN "UserGroup" g ON g."id" = m."groupId"
        WHERE m."userId" = ?
      `).all(u.id) as { id: string; name: string; groupAccessLevel: string; memberAccessLevel: string | null }[]
      return { ...u, groups }
    })

    return ok({ users: withGroups })
  } catch (e) {
    return serverError(e)
  }
}
