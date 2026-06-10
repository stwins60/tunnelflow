import nodemailer from 'nodemailer'
import type { NotificationPayload, SmtpConfig } from './types'

export async function sendSmtp(
  config: SmtpConfig,
  payload: NotificationPayload
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.password }
      : undefined,
  })

  const fieldRows = payload.fields
    ? Object.entries(payload.fields)
        .map(([k, v]) => `<tr><td style="padding:4px 8px;color:#6b7280;font-size:12px">${k}</td><td style="padding:4px 8px;font-size:12px">${v}</td></tr>`)
        .join('')
    : ''

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="margin:0 0 8px;font-size:18px">${payload.title}</h2>
      <p style="margin:0 0 16px;color:#374151">${payload.body}</p>
      ${fieldRows ? `<table style="border-collapse:collapse;width:100%">${fieldRows}</table>` : ''}
      <p style="margin-top:24px;font-size:11px;color:#9ca3af">Sent by TunnelFlow</p>
    </div>
  `

  await transport.sendMail({
    from: config.from,
    to: config.to,
    subject: payload.title,
    text: `${payload.body}${payload.fields ? '\n\n' + Object.entries(payload.fields).map(([k, v]) => `${k}: ${v}`).join('\n') : ''}`,
    html,
  })
}
