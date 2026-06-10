/**
 * PATCH  /api/users/groups/[id]  — rename group or change default accessLevel
 * DELETE /api/users/groups/[id]  — delete group (members are not removed from workspace)
 */

import { NextRequest } from 'next/server'
import { db, now } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError } from '@/lib/api-helpers'
import type { DbUserGroup } from '@/lib/db'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const group = db.prepare(`SELECT * FROM "UserGroup" WHERE "id" = ? AND "ownerId" = ?`).get(params.id, workspaceId) as DbUserGroup | undefined
    if (!group) return notFound('Group')

    const body = await req.json() as { name?: string; description?: string; accessLevel?: string }
    if (body.accessLevel && !['ADMIN', 'EDITOR', 'VIEWER'].includes(body.accessLevel)) {
      return err('accessLevel must be ADMIN, EDITOR, or VIEWER', 422)
    }

    db.prepare(`UPDATE "UserGroup" SET "name" = ?, "description" = ?, "accessLevel" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .run(body.name ?? group.name, body.description ?? group.description, body.accessLevel ?? group.accessLevel, now(), params.id)

    const updated = db.prepare(`SELECT * FROM "UserGroup" WHERE "id" = ?`).get(params.id) as DbUserGroup
    return ok({ group: updated })
  } catch (e) {
    return serverError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const result = db.prepare(`DELETE FROM "UserGroup" WHERE "id" = ? AND "ownerId" = ?`).run(params.id, workspaceId)
    if (result.changes === 0) return notFound('Group')
    return ok({ deleted: true })
  } catch (e) {
    return serverError(e)
  }
}
