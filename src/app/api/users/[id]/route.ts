/**
 * PATCH  /api/users/[id]  — update a user's accessLevel (admin only)
 * DELETE /api/users/[id]  — remove a user from the workspace (admin only)
 */

import { NextRequest } from 'next/server'
import { db, now } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

type Params = { params: { id: string } }

const VALID_LEVELS = new Set(['ADMIN', 'EDITOR', 'VIEWER'])

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const target = db.prepare(`SELECT * FROM "User" WHERE "id" = ? AND ("id" = ? OR "workspaceOwnerId" = ?)`).get(params.id, workspaceId, workspaceId) as DbUser | undefined
    if (!target) return notFound('User')
    if (target.id === session.userId) return err('Cannot change your own access level.', 400)

    const { accessLevel } = await req.json() as { accessLevel?: string }
    if (!accessLevel || !VALID_LEVELS.has(accessLevel)) {
      return err('accessLevel must be ADMIN, EDITOR, or VIEWER.', 422)
    }

    db.prepare(`UPDATE "User" SET "accessLevel" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .run(accessLevel, now(), params.id)

    return ok({ updated: true, accessLevel })
  } catch (e) {
    return serverError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const target = db.prepare(`SELECT * FROM "User" WHERE "id" = ? AND "workspaceOwnerId" = ?`).get(params.id, workspaceId) as DbUser | undefined
    if (!target) return notFound('User')
    if (target.id === session.userId) return err('Cannot remove yourself.', 400)

    db.prepare(`DELETE FROM "User" WHERE "id" = ?`).run(params.id)
    return ok({ deleted: true })
  } catch (e) {
    return serverError(e)
  }
}
