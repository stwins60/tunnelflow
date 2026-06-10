/**
 * POST /api/auth/login
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, audit, getEffectiveAccessLevel } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { ok, err, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbUser } from '@/lib/db'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return err('Invalid email or password.', 422)
    }

    const { email, password } = parsed.data

    const user = db.prepare('SELECT * FROM "User" WHERE "email" = ?').get(email) as DbUser | undefined
    if (!user) {
      // Constant-time-ish response to avoid user enumeration
      await new Promise((r) => setTimeout(r, 300))
      return err('Invalid email or password.', 401)
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      await audit({
        action: 'LOGIN_FAILED',
        resource: 'user',
        resourceId: user.id,
        details: { email },
        ipAddress: getClientIp(request),
      })
      return err('Invalid email or password.', 401)
    }

    const session = await getSession()
    session.userId = user.id
    session.email = user.email
    session.role = user.role as 'ADMIN' | 'VIEWER'
    session.accessLevel = getEffectiveAccessLevel(user.id)
    session.isLoggedIn = true
    await session.save()

    await audit({
      action: 'LOGIN_SUCCESS',
      resource: 'user',
      resourceId: user.id,
      ipAddress: getClientIp(request),
    })

    return ok({ email: user.email, role: user.role })
  } catch (e) {
    return serverError(e)
  }
}
