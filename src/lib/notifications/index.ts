/**
 * Notification dispatcher.
 * Loads all enabled channels for a user, decrypts their configs, and fans out
 * the payload to the appropriate sender. Errors per-channel are caught and
 * recorded in the DB without throwing to callers.
 */

import { db, now } from '../db'
import { encrypt, decrypt } from '../crypto'
import { sendSmtp } from './smtp'
import { sendSlack } from './slack'
import { sendDiscord } from './discord'
import { sendTelegram } from './telegram'
import type {
  NotificationEvent,
  NotificationPayload,
  NotificationChannel,
  SmtpConfig,
  SlackConfig,
  DiscordConfig,
  TelegramConfig,
  ChannelConfig,
} from './types'

export type { NotificationEvent, NotificationPayload, NotificationChannel }
export { ALL_EVENTS, EVENT_LABELS } from './types'

// ─── Config encryption helpers ────────────────────────────────────────────────

/** Fields that contain sensitive values and must be AES-encrypted at rest */
const SENSITIVE_FIELDS: Record<string, string[]> = {
  smtp:     ['password'],
  slack:    ['webhookUrl'],
  discord:  ['webhookUrl'],
  telegram: ['botToken'],
}

export function encryptChannelConfig(type: string, config: Record<string, unknown>): string {
  const sensitive = SENSITIVE_FIELDS[type] ?? []
  const out: Record<string, unknown> = { ...config }
  for (const field of sensitive) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = encrypt(out[field] as string)
    }
  }
  return JSON.stringify(out)
}

export function decryptChannelConfig(type: string, configJson: string): ChannelConfig {
  const raw = JSON.parse(configJson) as Record<string, unknown>
  const sensitive = SENSITIVE_FIELDS[type] ?? []
  for (const field of sensitive) {
    if (typeof raw[field] === 'string' && raw[field]) {
      try {
        raw[field] = decrypt(raw[field] as string)
      } catch {
        // leave as-is if decryption fails (e.g. value was never encrypted)
      }
    }
  }
  return raw as unknown as ChannelConfig
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export function dbRowToChannel(row: Record<string, unknown>): NotificationChannel {
  return {
    id:           row.id as string,
    userId:       row.userId as string,
    type:         row.type as NotificationChannel['type'],
    name:         row.name as string,
    config:       decryptChannelConfig(row.type as string, row.config as string),
    enabled:      Boolean(row.enabled),
    events:       JSON.parse(row.events as string) as NotificationEvent[],
    lastTestedAt: (row.lastTestedAt as string | null) ?? null,
    lastErrorAt:  (row.lastErrorAt as string | null) ?? null,
    lastError:    (row.lastError as string | null) ?? null,
    createdAt:    row.createdAt as string,
    updatedAt:    row.updatedAt as string,
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function sendNotification(
  payload: NotificationPayload,
  userId: string
): Promise<void> {
  const rows = db
    .prepare(`SELECT * FROM "NotificationChannel" WHERE userId = ? AND enabled = 1`)
    .all(userId) as Record<string, unknown>[]

  const channels = rows
    .map(dbRowToChannel)
    .filter(ch => ch.events.includes(payload.event))

  await Promise.all(channels.map(ch => dispatchOne(ch, payload)))
}

async function dispatchOne(
  channel: NotificationChannel,
  payload: NotificationPayload
): Promise<void> {
  try {
    switch (channel.type) {
      case 'smtp':
        await sendSmtp(channel.config as SmtpConfig, payload)
        break
      case 'slack':
        await sendSlack(channel.config as SlackConfig, payload)
        break
      case 'discord':
        await sendDiscord(channel.config as DiscordConfig, payload)
        break
      case 'telegram':
        await sendTelegram(channel.config as TelegramConfig, payload)
        break
    }
    // Clear any previous error on success
    db.prepare(`
      UPDATE "NotificationChannel"
      SET lastError = NULL, lastErrorAt = NULL, updatedAt = ?
      WHERE id = ?
    `).run(now(), channel.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    db.prepare(`
      UPDATE "NotificationChannel"
      SET lastError = ?, lastErrorAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(msg, now(), now(), channel.id)
    // Don't rethrow — one bad channel must not block the others
    console.error(`[notifications] channel ${channel.id} (${channel.type}) failed:`, msg)
  }
}
