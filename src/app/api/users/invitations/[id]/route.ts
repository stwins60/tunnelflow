/**
 * DELETE /api/users/invitations/[id]  — revoke a pending invitation
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-helpers'

type Params = { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)

    // Only allow revoking invites created by this workspace
    const result = db.prepare(`
      DELETE FROM "UserInvitation"
      WHERE "id" = ? AND "invitedBy" IN (
        SELECT "id" FROM "User" WHERE "id" = ? OR "workspaceOwnerId" = ?
      ) AND "acceptedAt" IS NULL
    `).run(params.id, workspaceId, workspaceId)

    if (result.changes === 0) return notFound('Invitation')
    return ok({ revoked: true })
  } catch (e) {
    return serverError(e)
  }
}
