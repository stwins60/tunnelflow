import type { NotificationPayload, TelegramConfig } from './types'

export async function sendTelegram(
  config: TelegramConfig,
  payload: NotificationPayload
): Promise<void> {
  const lines: string[] = [
    `<b>${escapeHtml(payload.title)}</b>`,
    escapeHtml(payload.body),
  ]

  if (payload.fields) {
    lines.push('')
    for (const [k, v] of Object.entries(payload.fields)) {
      lines.push(`<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`)
    }
  }

  lines.push('\n<i>Sent by TunnelFlow</i>')

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: lines.join('\n'),
      parse_mode: 'HTML',
    }),
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(`Telegram API error ${res.status}: ${JSON.stringify(json)}`)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
