/**
 * Standalone transactional mailer for system emails (password reset, etc.).
 * Configured via environment variables — independent of user-configured
 * NotificationChannel SMTP settings.
 *
 * Required env vars:
 *   SMTP_HOST     — e.g. smtp.mailgun.org
 *   SMTP_PORT     — e.g. 587
 *   SMTP_USER     — SMTP username / API key
 *   SMTP_PASS     — SMTP password
 *   SMTP_FROM     — From address, e.g. "TunnelFlow <noreply@example.com>"
 *   SMTP_SECURE   — "true" for TLS/SSL (port 465), omit or "false" for STARTTLS
 *
 * All vars are optional — if SMTP_HOST is not set, sendMail() will throw
 * a descriptive error rather than silently failing.
 */

import nodemailer from 'nodemailer'

export interface MailOptions {
  to: string
  subject: string
  text: string
  html: string
}

export async function sendMail(options: MailOptions): Promise<void> {
  const host = process.env.SMTP_HOST
  if (!host) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM environment variables.'
    )
  }

  const port = Number(process.env.SMTP_PORT ?? 587)
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM ?? 'TunnelFlow <noreply@example.com>'

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  })

  await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}

// ─── Email templates ──────────────────────────────────────────────────────────

export function buildPasswordResetEmail(params: {
  email: string
  resetUrl: string
}): MailOptions {
  const { email, resetUrl } = params

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
      <p style="margin:0 0 16px;color:#374151;line-height:1.6">
        We received a request to reset the password for <strong>${email}</strong>.
        Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
        Reset password
      </a>
      <p style="margin-top:24px;color:#6b7280;font-size:13px;line-height:1.6">
        If you didn't request a password reset, you can safely ignore this email.
        Your password will not change until you click the link above.
      </p>
      <p style="margin-top:8px;color:#6b7280;font-size:13px">
        Or copy this URL into your browser:<br/>
        <span style="color:#2563eb;word-break:break-all">${resetUrl}</span>
      </p>
      <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb"/>
      <p style="margin:0;font-size:11px;color:#9ca3af">Sent by TunnelFlow</p>
    </div>
  `

  const text = [
    'Reset your TunnelFlow password',
    '',
    `We received a request to reset the password for ${email}.`,
    `Click the link below to choose a new password (expires in 1 hour):`,
    '',
    resetUrl,
    '',
    "If you didn't request a password reset, you can safely ignore this email.",
  ].join('\n')

  return {
    to: email,
    subject: 'Reset your TunnelFlow password',
    text,
    html,
  }
}
