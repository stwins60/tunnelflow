/**
 * GET    /api/servers/[id]    — get server detail
 * PATCH  /api/servers/[id]    — update server (and re-provision)
 * DELETE /api/servers/[id]    — deprovision and delete server
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now } from '@/lib/db'
import { requireAdmin, requireAuth, requireEditor } from '@/lib/session'
import {
  getCfCredentials,
  provisionServer,
  deprovisionServer,
  removeTunnelRoute,
  deleteDnsRecord,
  getZoneForSubdomain,
} from '@/lib/cloudflare'
import { logDnsRecordDeleted } from '@/lib/dns-audit'
import { resolveWorkspaceId, audit } from '@/lib/auth'
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

    const wsId = resolveWorkspaceId(session.userId!)
    const raw = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, wsId) as DbServer | undefined
    if (!raw) return notFound('Server')

    return ok({ server: attachTunnel(raw) })
  } catch (e) {
    return serverError(e)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(64).optional(),
  subdomain: z
    .string()
    .min(1, 'Subdomain is required')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid subdomain format')
    .optional(),
  upstream: z
    .string()
    .min(1, 'Upstream address is required')
    .regex(
      /^([a-zA-Z][a-zA-Z0-9+\-.]*:\/\/.+|[a-zA-Z0-9][a-zA-Z0-9._-]*(:[0-9]{1,5})?(\/.*)?)$/,
      'Upstream must be a URL or a bare host/container name (e.g. tunnel-manager:3000)'
    )
    .optional(),
  protocol: z.enum(['http', 'https', 'tcp', 'ssh', 'rdp', 'smb']).optional(),
  tunnelId: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reprovision: z.boolean().default(true),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireEditor().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    const server = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { name, subdomain, upstream, protocol, tunnelId, zoneId, notes, reprovision } = parsed.data

    // Check for subdomain conflict in our DB if subdomain changed
    if (subdomain !== undefined && subdomain !== server.subdomain) {
      const conflict = db.prepare(
        'SELECT "id" FROM "Server" WHERE "subdomain" = ? AND "id" != ?'
      ).get(subdomain, params.id)
      if (conflict) {
        return err(
          `A server with subdomain "${subdomain}" already exists in Tunnel Manager.`,
          409,
          'SUBDOMAIN_CONFLICT'
        )
      }
    }

    // Validate new tunnel belongs to this user if provided
    if (tunnelId !== undefined && tunnelId !== null) {
      const tunnel = db.prepare(
        'SELECT "id" FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
      ).get(tunnelId, wsId)
      if (!tunnel) return err('Specified tunnel not found.', 422)
    }

    // Normalise upstream if provided: add protocol prefix if bare hostname/container name, strip trailing slash
    let cleanUpstream = upstream
    if (upstream !== undefined) {
      const effProtocol = protocol ?? server.protocol
      const normalizedUpstream = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(upstream)
        ? upstream
        : `${effProtocol}://${upstream}`
      cleanUpstream = normalizedUpstream.replace(/\/$/, '')
    }

    const subdomainChanged = subdomain !== undefined && subdomain !== server.subdomain
    const tunnelChanged = tunnelId !== undefined && tunnelId !== server.tunnelId

    // Clean up old routing if subdomain or tunnel changed
    if ((subdomainChanged || tunnelChanged) && server.tunnelId) {
      try {
        const oldTunnel = db.prepare('SELECT * FROM "Tunnel" WHERE "id" = ?').get(server.tunnelId) as DbTunnel | undefined
        const { token, accountId, zones } = await getCfCredentials(wsId)
        if (oldTunnel) {
          await removeTunnelRoute(accountId, oldTunnel.cfTunnelId, server.subdomain, token).catch((e) =>
            console.error(`[cf] Failed to remove old tunnel route for ${server.subdomain}:`, e)
          )
        }
        if (subdomainChanged && server.dnsRecordId) {
          const oldZoneId = server.zoneId ?? getZoneForSubdomain(server.subdomain, zones)?.id ?? zones[0]?.id
          if (oldZoneId) {
            await deleteDnsRecord(oldZoneId, server.dnsRecordId, token).catch((e) =>
              console.error(`[cf] Failed to delete old DNS record for ${server.subdomain}:`, e)
            )
            logDnsRecordDeleted({
              cfRecordId: server.dnsRecordId,
              zoneId: oldZoneId,
              name: server.subdomain,
              userId: wsId,
            })
          }
        }
      } catch (cleanupErr) {
        console.error('[cf] Failed during cleanup of old routing on server update:', cleanupErr)
      }
    }

    // Build dynamic update
    const sets: string[] = ['"updatedAt" = ?']
    const args: unknown[] = [now()]

    if (name !== undefined)          { sets.push('"name" = ?');          args.push(name) }
    if (subdomain !== undefined)     { sets.push('"subdomain" = ?');     args.push(subdomain) }
    if (cleanUpstream !== undefined) { sets.push('"upstream" = ?');      args.push(cleanUpstream) }
    if (protocol !== undefined)      { sets.push('"protocol" = ?');      args.push(protocol) }
    if (tunnelId !== undefined)      { sets.push('"tunnelId" = ?');      args.push(tunnelId) }
    if (zoneId !== undefined)        { sets.push('"zoneId" = ?');        args.push(zoneId) }
    if (notes !== undefined)         { sets.push('"notes" = ?');         args.push(notes) }
    if (subdomainChanged)            { sets.push('"dnsRecordId" = NULL'); }

    args.push(params.id)
    db.prepare(`UPDATE "Server" SET ${sets.join(', ')} WHERE "id" = ?`).run(...args)

    const updated = attachTunnel(db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(params.id) as DbServer)

    await audit({
      action: 'UPDATE_SERVER',
      resource: 'server',
      resourceId: server.id,
      details: {
        changes: {
          name,
          subdomain,
          upstream: cleanUpstream,
          protocol,
          tunnelId,
          zoneId,
          notes,
        },
      },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    if (reprovision && updated.tunnelId) {
      try {
        const provisioned = await provisionServer(updated.id, wsId)
        return ok({ server: provisioned })
      } catch (provisionErr: any) {
        console.error('Provisioning failed on update:', provisionErr)
        return ok({
          server: updated,
          warning: `Server updated, but Cloudflare provisioning failed: ${provisionErr?.message ?? 'Unknown error'}`,
        })
      }
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

    const wsId = resolveWorkspaceId(session.userId!)
    const server = db.prepare(
      'SELECT * FROM "Server" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, wsId) as DbServer | undefined
    if (!server) return notFound('Server')

    // Deprovision from Cloudflare
    await deprovisionServer(server.id, wsId)

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
