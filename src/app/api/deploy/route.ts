/**
 * Deployment API — provision or deprovision a server via API key Bearer auth.
 * POST /api/deploy   → provision
 * DELETE /api/deploy → deprovision
 *
 * Authorization: Bearer tfk_<key>
 * Required scopes: 'deploy' (or 'admin')
 */

import { NextRequest } from 'next/server'
import { resolveApiKey, assertScope } from '@/lib/apikey'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { provisionServer, deprovisionServer } from '@/lib/cloudflare'
import { db } from '@/lib/db'
import type { DbServer } from '@/lib/db'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  return auth.slice(7).trim() || null
}

export async function POST(req: NextRequest) {
  try {
    const raw = extractBearer(req)
    if (!raw) return unauthorized()

    const key = resolveApiKey(raw)
    if (!key) return unauthorized()
    assertScope(key, 'deploy')

    const wsId = resolveWorkspaceId(key.userId)
    const body = await req.json()
    const { serverId } = body

    if (!serverId || typeof serverId !== 'string') {
      return err('serverId is required')
    }

    // Ensure server belongs to this workspace
    const server = db
      .prepare('SELECT * FROM "Server" WHERE "id" = ? AND "userId" = ?')
      .get(serverId, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    const result = await provisionServer(serverId, wsId)

    await audit({
      action: 'DEPLOY_SERVER',
      resource: 'Server',
      resourceId: serverId,
      details: { via: 'api_key', keyPrefix: key.prefix },
      userId: key.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ server: result })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) {
      return unauthorized()
    }
    return serverError(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const raw = extractBearer(req)
    if (!raw) return unauthorized()

    const key = resolveApiKey(raw)
    if (!key) return unauthorized()
    assertScope(key, 'deploy')

    const wsId = resolveWorkspaceId(key.userId)
    const body = await req.json()
    const { serverId } = body

    if (!serverId || typeof serverId !== 'string') {
      return err('serverId is required')
    }

    const server = db
      .prepare('SELECT * FROM "Server" WHERE "id" = ? AND "userId" = ?')
      .get(serverId, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    await deprovisionServer(serverId, wsId)

    await audit({
      action: 'UNDEPLOY_SERVER',
      resource: 'Server',
      resourceId: serverId,
      details: { via: 'api_key', keyPrefix: key.prefix },
      userId: key.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ deprovisioned: true })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) {
      return unauthorized()
    }
    return serverError(e)
  }
}
