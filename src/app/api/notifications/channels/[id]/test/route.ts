import { NextRequest } from 'next/server'
import { db, now } from '@/lib/db'
import { requireAuth } from '@/lib/session'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-helpers'
import { dbRowToChannel } from '@/lib/notifications'
import { sendSmtp } from '@/lib/notifications/smtp'
import { sendSlack } from '@/lib/notifications/slack'
import { sendDiscord } from '@/lib/notifications/discord'
import { sendTelegram } from '@/lib/notifications/telegram'
import type {
  SmtpConfig,
  SlackConfig,
  DiscordConfig,
  TelegramConfig,
} from '@/lib/notifications/types'

type Params = { params: { id: string } }

// POST /api/notifications/channels/[id]/test — send a test notification
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session?.userId) return unauthorized()

    const row = db
      .prepare(`SELECT * FROM "NotificationChannel" WHERE id = ? AND userId = ?`)
      .get(params.id, session.userId) as Record<string, unknown> | undefined

    if (!row) return notFound('Notification channel')

    const channel = dbRowToChannel(row)

    const payload = {
      event: 'sync.completed' as const,
      title: 'TunnelFlow — Test Notification',
      body:  'This is a test notification from TunnelFlow. If you see this, the channel is working correctly.',
      fields: {
        'Channel':  channel.name,
        'Type':     channel.type,
        'Sent at':  new Date().toISOString(),
      },
    }

    try {
      switch (channel.type) {
        case 'smtp':     await sendSmtp(channel.config as SmtpConfig, payload);         break
        case 'slack':    await sendSlack(channel.config as SlackConfig, payload);       break
        case 'discord':  await sendDiscord(channel.config as DiscordConfig, payload);  break
        case 'telegram': await sendTelegram(channel.config as TelegramConfig, payload); break
      }

      // Record successful test
      db.prepare(`
        UPDATE "NotificationChannel"
        SET lastTestedAt = ?, lastError = NULL, lastErrorAt = NULL, updatedAt = ?
        WHERE id = ?
      `).run(now(), now(), params.id)

      return ok({ sent: true })
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr)
      db.prepare(`
        UPDATE "NotificationChannel"
        SET lastTestedAt = ?, lastError = ?, lastErrorAt = ?, updatedAt = ?
        WHERE id = ?
      `).run(now(), msg, now(), now(), params.id)

      return ok({ sent: false, error: msg })
    }
  } catch (e) {
    return serverError(e)
  }
}
