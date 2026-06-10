import type { NotificationPayload, DiscordConfig } from './types'

// Discord embed colour by event prefix
function colourForTitle(title: string): number {
  if (/error/i.test(title)) return 0xef4444   // red
  if (/drift/i.test(title)) return 0xf59e0b   // amber
  if (/complet|provision/i.test(title)) return 0x22c55e  // green
  return 0x3b82f6  // blue (default)
}

export async function sendDiscord(
  config: DiscordConfig,
  payload: NotificationPayload
): Promise<void> {
  const fields = payload.fields
    ? Object.entries(payload.fields).map(([name, value]) => ({
        name,
        value,
        inline: true,
      }))
    : []

  const body = {
    username: config.username ?? 'TunnelFlow',
    embeds: [
      {
        title: payload.title,
        description: payload.body,
        color: colourForTitle(payload.title),
        fields,
        footer: { text: 'TunnelFlow' },
        timestamp: new Date().toISOString(),
      },
    ],
  }

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord webhook returned ${res.status}: ${text}`)
  }
}
