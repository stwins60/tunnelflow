import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now } from '@/lib/db'
import { ok, err, serverError } from '@/lib/api-helpers'
import { hashPassword, audit } from '@/lib/auth'
import { getClientIp } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? 'Invalid request'
      return err(message, 400)
    }

    const { token, password } = parsed.data
    const ip = getClientIp(req)

    // Look up user by token that is not expired
    const user = db
      .prepare(`
        SELECT * FROM "User"
        WHERE "resetToken" = ?
          AND "resetTokenExpiry" IS NOT NULL
          AND "resetTokenExpiry" > ?
      `)
      .get(token, now()) as DbUser | undefined

    if (!user) {
      return err('This reset link is invalid or has expired.', 400)
    }

    // Hash new password and clear the token
    const hashed = await hashPassword(password)
    const ts = now()

    db.prepare(`
      UPDATE "User"
      SET "password" = ?,
          "resetToken" = NULL,
          "resetTokenExpiry" = NULL,
          "updatedAt" = ?
      WHERE "id" = ?
    `).run(hashed, ts, user.id)

    await audit({
      action: 'PASSWORD_RESET',
      resource: 'User',
      resourceId: user.id,
      details: { email: user.email },
      userId: user.id,
      ipAddress: ip,
    })

    return ok({ message: 'Password reset successfully. You can now sign in.' })
  } catch (error) {
    console.error('[reset-password]', error)
    return serverError(error)
  }
}
