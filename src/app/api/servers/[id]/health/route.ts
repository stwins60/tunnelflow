import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { db, type DbServer } from '@/lib/db'
import { getHealthHistory, getLatestHealthCheck, isInMaintenanceWindow } from '@/lib/health-checker'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const wsId = resolveWorkspaceId(session.userId!)

    const server = db
      .prepare('SELECT * FROM "Server" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    const latest = getLatestHealthCheck(params.id)
    const history = getHealthHistory(params.id, 50)
    const inMaintenance = isInMaintenanceWindow(params.id)

    return ok({ latest, history, inMaintenance })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    return serverError(e)
  }
}
