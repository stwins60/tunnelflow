import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, newId, type DbServer, type DbMaintenanceWindow } from '@/lib/db'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const server = db
      .prepare('SELECT * FROM "Server" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    const windows = db
      .prepare('SELECT * FROM "MaintenanceWindow" WHERE "serverId" = ? ORDER BY "startsAt" ASC')
      .all(params.id) as DbMaintenanceWindow[]

    return ok({ windows })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const server = db
      .prepare('SELECT * FROM "Server" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    const body = await req.json()
    const { title, startsAt, endsAt, recurring, recurrence } = body

    if (!title || !startsAt || !endsAt) {
      return err('title, startsAt, and endsAt are required')
    }
    if (new Date(startsAt) >= new Date(endsAt)) {
      return err('startsAt must be before endsAt')
    }

    const id = newId()
    const ts = now()
    db.prepare(`
      INSERT INTO "MaintenanceWindow" ("id", "serverId", "userId", "title", "startsAt", "endsAt", "recurring", "recurrence", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.id, wsId, title, startsAt, endsAt, recurring ? 1 : 0, recurrence ?? null, ts, ts)

    const window = db.prepare('SELECT * FROM "MaintenanceWindow" WHERE "id" = ?').get(id) as DbMaintenanceWindow

    await audit({
      action: 'CREATE_MAINTENANCE_WINDOW',
      resource: 'MaintenanceWindow',
      resourceId: id,
      details: { serverId: params.id, title, startsAt, endsAt },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ window }, 201)
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
