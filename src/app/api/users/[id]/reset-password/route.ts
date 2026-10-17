import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now } from '@/lib/db'
import { hashPassword, resolveWorkspaceId, audit } from '@/lib/auth'
import { requireAdmin } from '@/lib/session'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

type Params = { params: { id: string } }

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)

    // Target must belong to this workspace (invited member or the owner themselves)
    const target = db
      .prepare(`SELECT * FROM "User" WHERE "id" = ? AND ("id" = ? OR "workspaceOwnerId" = ?)`)
      .get(params.id, workspaceId, workspaceId) as DbUser | undefined

    if (!target) return notFound('User')

    // Prevent resetting another workspace owner's password
    if (target.workspaceOwnerId === null && target.id !== session.userId) {
      return err('Cannot reset the workspace owner\'s password.', 403)
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.errors[0]?.message ?? 'Invalid request', 400)
    }

    const hashed = await hashPassword(parsed.data.password)

    db.prepare(`
      UPDATE "User"
      SET "password" = ?,
          "resetToken" = NULL,
          "resetTokenExpiry" = NULL,
          "updatedAt" = ?
      WHERE "id" = ?
    `).run(hashed, now(), params.id)

    await audit({
      action: 'ADMIN_PASSWORD_RESET',
      resource: 'User',
      resourceId: params.id,
      details: { targetEmail: target.email, resetBy: session.email },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ reset: true })
  } catch (e) {
    return serverError(e)
  }
}
