/**
 * POST   /api/users/groups/[id]/members  — add a user to the group
 * DELETE /api/users/groups/[id]/members  — remove a user from the group
 *   body: { userId, accessLevel? }
 */

import { NextRequest } from 'next/server'
import { db, now, newId } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError } from '@/lib/api-helpers'
import type { DbUserGroup } from '@/lib/db'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const group = db.prepare(`SELECT * FROM "UserGroup" WHERE "id" = ? AND "ownerId" = ?`).get(params.id, workspaceId) as DbUserGroup | undefined
    if (!group) return notFound('Group')

    const { userId, accessLevel = null } = await req.json() as { userId?: string; accessLevel?: string | null }
    if (!userId) return err('userId is required', 422)
    if (accessLevel && !['ADMIN', 'EDITOR', 'VIEWER'].includes(accessLevel)) {
      return err('accessLevel must be ADMIN, EDITOR, or VIEWER', 422)
    }

    // User must belong to the same workspace
    const member = db.prepare(`SELECT "id" FROM "User" WHERE "id" = ? AND ("id" = ? OR "workspaceOwnerId" = ?)`).get(userId, workspaceId, workspaceId)
    if (!member) return notFound('User')

    db.prepare(`INSERT OR REPLACE INTO "UserGroupMember" ("id","groupId","userId","accessLevel","createdAt") VALUES (?,?,?,?,?)`)
      .run(newId(), params.id, userId, accessLevel, now())

    return ok({ added: true })
  } catch (e) {
    return serverError(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const group = db.prepare(`SELECT * FROM "UserGroup" WHERE "id" = ? AND "ownerId" = ?`).get(params.id, workspaceId) as DbUserGroup | undefined
    if (!group) return notFound('Group')

    const { userId } = await req.json() as { userId?: string }
    if (!userId) return err('userId is required', 422)

    const result = db.prepare(`DELETE FROM "UserGroupMember" WHERE "groupId" = ? AND "userId" = ?`).run(params.id, userId)
    if (result.changes === 0) return notFound('Group member')
    return ok({ removed: true })
  } catch (e) {
    return serverError(e)
  }
}
