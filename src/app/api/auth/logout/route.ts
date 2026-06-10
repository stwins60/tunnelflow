/**
 * POST /api/auth/logout
 */

import { getSession } from '@/lib/session'
import { ok, serverError } from '@/lib/api-helpers'

export async function POST() {
  try {
    const session = await getSession()
    session.destroy()
    return ok({ message: 'Logged out' })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * GET /api/auth/me
 * Returns the current session user (or 401).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) {
      return ok({ authenticated: false })
    }
    return ok({
      authenticated: true,
      email: session.email,
      role: session.role,
    })
  } catch (e) {
    return serverError(e)
  }
}
