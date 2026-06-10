/**
 * GET /api/health
 * Public health check endpoint.
 */

import { db } from '@/lib/db'
import { ok, serverError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Quick DB connectivity check
    db.prepare('SELECT 1').get()

    const setupComplete = true // SaaS mode — setup is per-user, not global

    return ok({
      status: 'ok',
      timestamp: new Date().toISOString(),
      setupComplete,
      version: process.env.npm_package_version ?? '1.0.0',
    })
  } catch (e) {
    return serverError(e)
  }
}
