import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { runHealthChecks } from '@/lib/health-checker'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'

export async function POST(_req: NextRequest) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)
    const results = await runHealthChecks(wsId)
    const summary = {
      total: results.length,
      up: results.filter((r) => r.status === 'up').length,
      down: results.filter((r) => r.status !== 'up').length,
    }
    return ok({ results, summary })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
