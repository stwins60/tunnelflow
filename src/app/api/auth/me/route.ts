/**
 * GET /api/auth/me — returns current session info
 */

import { getSession } from '@/lib/session'
import { ok, serverError } from '@/lib/api-helpers'

export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) {
      return ok({ authenticated: false, email: null, role: null })
    }
    return ok({
      authenticated: true,
      email: session.email,
      role: session.role,
      accessLevel: session.accessLevel ?? session.role ?? 'VIEWER',
    })
  } catch (e) {
    return serverError(e)
  }
}
