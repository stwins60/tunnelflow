import { NextRequest } from 'next/server'
import { db, newId, now } from '@/lib/db'
import { requireAuth } from '@/lib/session'
import { ok, err, unauthorized, serverError } from '@/lib/api-helpers'
import { encryptChannelConfig, dbRowToChannel } from '@/lib/notifications'
import { ALL_EVENTS } from '@/lib/notifications/types'
import type { NotificationEvent } from '@/lib/notifications/types'

// GET /api/notifications/channels — list all channels for the current user
export async function GET() {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const rows = db
      .prepare(`SELECT * FROM "NotificationChannel" WHERE userId = ? ORDER BY createdAt DESC`)
      .all(session.userId) as Record<string, unknown>[]

    return ok(rows.map(dbRowToChannel))
  } catch (e) {
    return serverError(e)
  }
}

// POST /api/notifications/channels — create a new channel
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const body = await req.json() as {
      type: string
      name: string
      config: Record<string, unknown>
      events?: NotificationEvent[]
      enabled?: boolean
    }

    const { type, name, config, events = [], enabled = true } = body

    if (!type || !name) return err('type and name are required')
    if (!['smtp', 'slack', 'discord', 'telegram'].includes(type)) {
      return err('type must be one of: smtp, slack, discord, telegram')
    }

    // Validate events
    const invalidEvents = events.filter(e => !ALL_EVENTS.includes(e))
    if (invalidEvents.length) {
      return err(`Invalid events: ${invalidEvents.join(', ')}`)
    }

    const id = newId()
    const ts = now()
    const configJson = encryptChannelConfig(type, config)

    db.prepare(`
      INSERT INTO "NotificationChannel"
        (id, userId, type, name, config, enabled, events, lastTestedAt, lastErrorAt, lastError, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
    `).run(id, session.userId, type, name, configJson, enabled ? 1 : 0, JSON.stringify(events), ts, ts)

    const row = db.prepare(`SELECT * FROM "NotificationChannel" WHERE id = ?`).get(id) as Record<string, unknown>
    return ok(dbRowToChannel(row), 201)
  } catch (e) {
    return serverError(e)
  }
}
