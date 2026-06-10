/**
 * GET    /api/tunnels/[id]    — get tunnel detail (with live CF status)
 * PATCH  /api/tunnels/[id]    — rename tunnel
 * DELETE /api/tunnels/[id]    — delete tunnel and all its servers
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now } from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/session'
import { getCfCredentials } from '@/lib/cloudflare'
import { getTunnel, renameTunnel, deleteTunnel } from '@/lib/cloudflare/tunnels'
import { deprovisionServer } from '@/lib/cloudflare'
import { audit } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbTunnel, DbServer } from '@/lib/db'

interface Params {
  params: { id: string }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const tunnel = db.prepare(
      'SELECT * FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbTunnel | undefined
    if (!tunnel) return notFound('Tunnel')

    const servers = db.prepare('SELECT * FROM "Server" WHERE "tunnelId" = ?').all(params.id) as DbServer[]

    // Augment with live Cloudflare data
    let liveConnections: unknown[] = []
    try {
      const { token, accountId } = await getCfCredentials(session.userId)
      const cfTunnel = await getTunnel(accountId, tunnel.cfTunnelId, token)
      liveConnections = cfTunnel.connections ?? []
    } catch {
      // Non-fatal — return DB data only
    }

    return ok({ tunnel: { ...tunnel, servers, connections: liveConnections } })
  } catch (e) {
    return serverError(e)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const tunnel = db.prepare(
      'SELECT * FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbTunnel | undefined
    if (!tunnel) return notFound('Tunnel')

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { name } = parsed.data
    const { token, accountId } = await getCfCredentials(session.userId)

    // Update in Cloudflare
    await renameTunnel(accountId, tunnel.cfTunnelId, name, token)

    // Update in DB
    db.prepare('UPDATE "Tunnel" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?').run(name, now(), params.id)
    const updated = db.prepare('SELECT * FROM "Tunnel" WHERE "id" = ?').get(params.id) as DbTunnel

    await audit({
      action: 'RENAME_TUNNEL',
      resource: 'tunnel',
      resourceId: tunnel.id,
      details: { oldName: tunnel.name, newName: name },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ tunnel: updated })
  } catch (e) {
    return serverError(e)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const tunnel = db.prepare(
      'SELECT * FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbTunnel | undefined
    if (!tunnel) return notFound('Tunnel')

    const servers = db.prepare('SELECT * FROM "Server" WHERE "tunnelId" = ?').all(params.id) as DbServer[]

    const { token, accountId } = await getCfCredentials(session.userId)

    // Deprovision all servers first (removes routes + DNS)
    for (const server of servers) {
      try {
        await deprovisionServer(server.id, session.userId)
      } catch (err) {
        console.error(`[api] Failed to deprovision server ${server.id}:`, err)
      }
    }

    // Delete tunnel from Cloudflare
    await deleteTunnel(accountId, tunnel.cfTunnelId, token)

    // Delete from DB
    db.prepare('DELETE FROM "Server" WHERE "tunnelId" = ?').run(params.id)
    db.prepare('DELETE FROM "Tunnel" WHERE "id" = ?').run(params.id)

    await audit({
      action: 'DELETE_TUNNEL',
      resource: 'tunnel',
      resourceId: tunnel.id,
      details: { name: tunnel.name, cfTunnelId: tunnel.cfTunnelId },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ message: 'Tunnel deleted' })
  } catch (e) {
    return serverError(e)
  }
}
