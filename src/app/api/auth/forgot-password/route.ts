import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { db, now } from '@/lib/db'
import { ok, err, serverError } from '@/lib/api-helpers'
import { audit } from '@/lib/auth'
import { sendMail, buildPasswordResetEmail } from '@/lib/mailer'
import { getClientIp } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

const schema = z.object({
  email: z.string().email(),
})

const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return err('Invalid email address', 400)
    }

    const { email } = parsed.data
    const ip = getClientIp(req)

    // Always return 200 — never reveal whether an email is registered
    const user = db
      .prepare('SELECT * FROM "User" WHERE "email" = ?')
      .get(email) as DbUser | undefined

    if (user) {
      // Generate a secure random token
      const token = crypto.randomBytes(32).toString('hex')
      const expiry = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString()

      // Persist token + expiry
      db.prepare(`
        UPDATE "User"
        SET "resetToken" = ?, "resetTokenExpiry" = ?, "updatedAt" = ?
        WHERE "id" = ?
      `).run(token, expiry, now(), user.id)

      // Build the reset URL — use APP_URL env var or fall back to the request origin
      const origin =
        process.env.APP_URL ??
        `${req.nextUrl.protocol}//${req.nextUrl.host}`
      const resetUrl = `${origin}/reset-password?token=${token}`

      try {
        const mail = buildPasswordResetEmail({ email, resetUrl })
        await sendMail(mail)
      } catch (mailErr) {
        // Log the error but don't leak it to the caller
        console.error('[forgot-password] Failed to send reset email:', mailErr)
      }

      await audit({
        action: 'PASSWORD_RESET_REQUESTED',
        resource: 'User',
        resourceId: user.id,
        details: { email },
        userId: user.id,
        ipAddress: ip,
      })
    }

    // Always respond 200 with a generic message
    return ok({ message: 'If that email is registered, a reset link has been sent.' })
  } catch (error) {
    console.error('[forgot-password]', error)
    return serverError(error)
  }
}
