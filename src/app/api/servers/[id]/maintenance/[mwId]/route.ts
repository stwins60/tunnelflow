import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, type DbMaintenanceWindow } from '@/lib/db'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; mwId: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const mw = db
      .prepare('SELECT * FROM "MaintenanceWindow" WHERE "id" = ? AND "userId" = ?')
      .get(params.mwId, wsId) as DbMaintenanceWindow | undefined
    if (!mw || mw.serverId !== params.id) return notFound('Maintenance window')

    const body = await req.json()
    const { title, startsAt, endsAt, recurring, recurrence } = body

    const newStartsAt = startsAt ?? mw.startsAt
    const newEndsAt = endsAt ?? mw.endsAt
    if (new Date(newStartsAt) >= new Date(newEndsAt)) {
      return err('startsAt must be before endsAt')
    }

    db.prepare(`
      UPDATE "MaintenanceWindow"
      SET "title" = ?, "startsAt" = ?, "endsAt" = ?, "recurring" = ?, "recurrence" = ?, "updatedAt" = ?
      WHERE "id" = ?
    `).run(
      title ?? mw.title,
      newStartsAt,
      newEndsAt,
      recurring !== undefined ? (recurring ? 1 : 0) : (mw.recurring ? 1 : 0),
      recurrence !== undefined ? recurrence : mw.recurrence,
      now(),
      params.mwId
    )

    const updated = db
      .prepare('SELECT * FROM "MaintenanceWindow" WHERE "id" = ?')
      .get(params.mwId) as DbMaintenanceWindow

    await audit({
      action: 'UPDATE_MAINTENANCE_WINDOW',
      resource: 'MaintenanceWindow',
      resourceId: params.mwId,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ window: updated })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; mwId: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const mw = db
      .prepare('SELECT * FROM "MaintenanceWindow" WHERE "id" = ? AND "userId" = ?')
      .get(params.mwId, wsId) as DbMaintenanceWindow | undefined
    if (!mw || mw.serverId !== params.id) return notFound('Maintenance window')

    db.prepare('DELETE FROM "MaintenanceWindow" WHERE "id" = ?').run(params.mwId)

    await audit({
      action: 'DELETE_MAINTENANCE_WINDOW',
      resource: 'MaintenanceWindow',
      resourceId: params.mwId,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ deleted: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
