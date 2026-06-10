import { NextRequest } from 'next/server'
import { db, now } from '@/lib/db'
import { requireAuth } from '@/lib/session'
import { ok, err, unauthorized, notFound, serverError } from '@/lib/api-helpers'
import { encryptChannelConfig, dbRowToChannel } from '@/lib/notifications'
import { ALL_EVENTS } from '@/lib/notifications/types'
import type { NotificationEvent } from '@/lib/notifications/types'

type Params = { params: { id: string } }

// GET /api/notifications/channels/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const row = db
      .prepare(`SELECT * FROM "NotificationChannel" WHERE id = ? AND userId = ?`)
      .get(params.id, session.userId) as Record<string, unknown> | undefined

    if (!row) return notFound('Notification channel')
    return ok(dbRowToChannel(row))
  } catch (e) {
    return serverError(e)
  }
}

// PATCH /api/notifications/channels/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const existing = db
      .prepare(`SELECT * FROM "NotificationChannel" WHERE id = ? AND userId = ?`)
      .get(params.id, session.userId) as Record<string, unknown> | undefined

    if (!existing) return notFound('Notification channel')

    const body = await req.json() as {
      name?: string
      config?: Record<string, unknown>
      events?: NotificationEvent[]
      enabled?: boolean
    }

    const { name, config, events, enabled } = body
    const ts = now()

    if (events !== undefined) {
      const invalid = events.filter(e => !ALL_EVENTS.includes(e))
      if (invalid.length) return err(`Invalid events: ${invalid.join(', ')}`)
    }

    const newConfig = config !== undefined
      ? encryptChannelConfig(existing.type as string, config)
      : (existing.config as string)

    db.prepare(`
      UPDATE "NotificationChannel" SET
        name    = ?,
        config  = ?,
        events  = ?,
        enabled = ?,
        updatedAt = ?
      WHERE id = ? AND userId = ?
    `).run(
      name    ?? existing.name,
      newConfig,
      events !== undefined ? JSON.stringify(events) : existing.events,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      ts,
      params.id,
      session.userId,
    )

    const updated = db
      .prepare(`SELECT * FROM "NotificationChannel" WHERE id = ?`)
      .get(params.id) as Record<string, unknown>
    return ok(dbRowToChannel(updated))
  } catch (e) {
    return serverError(e)
  }
}

// DELETE /api/notifications/channels/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const result = db
      .prepare(`DELETE FROM "NotificationChannel" WHERE id = ? AND userId = ?`)
      .run(params.id, session.userId)

    if (result.changes === 0) return notFound('Notification channel')
    return ok({ deleted: true })
  } catch (e) {
    return serverError(e)
  }
}
