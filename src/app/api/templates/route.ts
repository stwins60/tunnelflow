import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, newId, type DbServerTemplate } from '@/lib/db'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'

export async function GET() {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)
    const templates = db
      .prepare('SELECT * FROM "ServerTemplate" WHERE "userId" = ? ORDER BY "name" ASC')
      .all(wsId) as DbServerTemplate[]
    return ok({ templates })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)
    const body = await req.json()
    const { name, description, protocol, upstreamPattern, notes } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return err('name is required')
    }

    const id = newId()
    const ts = now()
    db.prepare(`
      INSERT INTO "ServerTemplate" ("id", "userId", "name", "description", "protocol", "upstreamPattern", "notes", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, wsId, name.trim(), description ?? null, protocol ?? 'http', upstreamPattern ?? null, notes ?? null, ts, ts)

    const template = db.prepare('SELECT * FROM "ServerTemplate" WHERE "id" = ?').get(id) as DbServerTemplate

    await audit({
      action: 'CREATE_TEMPLATE',
      resource: 'ServerTemplate',
      resourceId: id,
      details: { name },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ template }, 201)
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
