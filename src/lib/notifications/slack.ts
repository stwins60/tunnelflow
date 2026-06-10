import type { NotificationPayload, SlackConfig } from './types'

export async function sendSlack(
  config: SlackConfig,
  payload: NotificationPayload
): Promise<void> {
  const fields = payload.fields
    ? Object.entries(payload.fields).map(([title, value]) => ({
        type: 'mrkdwn',
        text: `*${title}*\n${value}`,
      }))
    : []

  const body: Record<string, unknown> = {
    ...(config.channel ? { channel: config.channel } : {}),
    username: config.username ?? 'TunnelFlow',
    text: payload.title,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${payload.title}*\n${payload.body}` },
      },
      ...(fields.length > 0
        ? [{ type: 'section', fields }]
        : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Sent by *TunnelFlow*' }],
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
    throw new Error(`Slack webhook returned ${res.status}: ${text}`)
  }
}
