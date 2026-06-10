import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, type DbServerTemplate } from '@/lib/db'
import { ok, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const existing = db
      .prepare('SELECT * FROM "ServerTemplate" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbServerTemplate | undefined
    if (!existing) return notFound('Template')

    const body = await req.json()
    const { name, description, protocol, upstreamPattern, notes } = body

    db.prepare(`
      UPDATE "ServerTemplate"
      SET "name" = ?, "description" = ?, "protocol" = ?, "upstreamPattern" = ?, "notes" = ?, "updatedAt" = ?
      WHERE "id" = ?
    `).run(
      name ?? existing.name,
      description !== undefined ? description : existing.description,
      protocol ?? existing.protocol,
      upstreamPattern !== undefined ? upstreamPattern : existing.upstreamPattern,
      notes !== undefined ? notes : existing.notes,
      now(),
      params.id
    )

    const updated = db.prepare('SELECT * FROM "ServerTemplate" WHERE "id" = ?').get(params.id) as DbServerTemplate

    await audit({
      action: 'UPDATE_TEMPLATE',
      resource: 'ServerTemplate',
      resourceId: params.id,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ template: updated })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const existing = db
      .prepare('SELECT * FROM "ServerTemplate" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbServerTemplate | undefined
    if (!existing) return notFound('Template')

    db.prepare('DELETE FROM "ServerTemplate" WHERE "id" = ?').run(params.id)

    await audit({
      action: 'DELETE_TEMPLATE',
      resource: 'ServerTemplate',
      resourceId: params.id,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ deleted: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
