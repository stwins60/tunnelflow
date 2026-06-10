/**
 * POST /api/servers/[id]/provision
 * Manually trigger provisioning for a server (idempotent).
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { provisionServer } from '@/lib/cloudflare'
import { audit } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbServer } from '@/lib/db'

interface Params {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const server = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbServer | undefined
    if (!server) return notFound('Server')

    if (!server.tunnelId) {
      return err('Server has no tunnel assigned. Assign a tunnel first.', 422)
    }

    const provisioned = await provisionServer(server.id, session.userId)

    await audit({
      action: 'PROVISION_SERVER',
      resource: 'server',
      resourceId: server.id,
      details: { subdomain: server.subdomain },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ server: provisioned })
  } catch (e) {
    return serverError(e)
  }
}
