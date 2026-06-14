/**
 * GET    /api/servers/[id]    — get server detail
 * PATCH  /api/servers/[id]    — update server (and re-provision)
 * DELETE /api/servers/[id]    — deprovision and delete server
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now } from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/session'
import { provisionServer, deprovisionServer } from '@/lib/cloudflare'
import { audit } from '@/lib/auth'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbServer, DbServerWithTunnel, DbTunnel } from '@/lib/db'

interface Params {
  params: { id: string }
}

function attachTunnel(server: DbServer): DbServerWithTunnel {
  if (!server.tunnelId) return { ...server, tunnel: null }
  const tunnel = db.prepare(
    'SELECT "id", "name", "cfTunnelId", "status" FROM "Tunnel" WHERE "id" = ?'
  ).get(server.tunnelId) as Pick<DbTunnel, 'id' | 'name' | 'cfTunnelId' | 'status'> | undefined
  return { ...server, tunnel: tunnel ?? null }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const raw = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbServer | undefined
    if (!raw) return notFound('Server')

    return ok({ server: attachTunnel(raw) })
  } catch (e) {
    return serverError(e)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  upstream: z.string().regex(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/.+/).optional(),
  protocol: z.enum(['http', 'https', 'tcp', 'ssh', 'rdp', 'smb']).optional(),
  tunnelId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reprovision: z.boolean().default(false),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const server = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbServer | undefined
    if (!server) return notFound('Server')

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { name, upstream, protocol, tunnelId, notes, reprovision } = parsed.data

    // Validate new tunnel belongs to this user if provided
    if (tunnelId !== undefined && tunnelId !== null) {
      const tunnel = db.prepare(
        'SELECT "id" FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
      ).get(tunnelId, session.userId)
      if (!tunnel) return err('Specified tunnel not found.', 422)
    }

    // Build dynamic update
    const sets: string[] = ['"updatedAt" = ?']
    const args: unknown[] = [now()]

    if (name !== undefined)     { sets.push('"name" = ?');     args.push(name) }
    if (upstream !== undefined) { sets.push('"upstream" = ?'); args.push(upstream) }
    if (protocol !== undefined) { sets.push('"protocol" = ?'); args.push(protocol) }
    if (tunnelId !== undefined) { sets.push('"tunnelId" = ?'); args.push(tunnelId) }
    if (notes !== undefined)    { sets.push('"notes" = ?');    args.push(notes) }

    args.push(params.id)
    db.prepare(`UPDATE "Server" SET ${sets.join(', ')} WHERE "id" = ?`).run(...args)

    const updated = attachTunnel(db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(params.id) as DbServer)

    await audit({
      action: 'UPDATE_SERVER',
      resource: 'server',
      resourceId: server.id,
      details: { changes: { name, upstream, protocol, tunnelId } },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    if (reprovision && updated.tunnelId) {
      const provisioned = await provisionServer(updated.id, session.userId)
      return ok({ server: provisioned })
    }

    return ok({ server: updated })
  } catch (e) {
    return serverError(e)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const server = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbServer | undefined
    if (!server) return notFound('Server')

    // Deprovision from Cloudflare
    await deprovisionServer(server.id, session.userId)

    // Remove from DB
    db.prepare('DELETE FROM "Server" WHERE "id" = ?').run(params.id)

    await audit({
      action: 'DELETE_SERVER',
      resource: 'server',
      resourceId: server.id,
      details: { name: server.name, subdomain: server.subdomain },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ message: 'Server deleted' })
  } catch (e) {
    return serverError(e)
  }
}
