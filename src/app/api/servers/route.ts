/**
 * GET  /api/servers   — list servers for the authenticated user
 * POST /api/servers   — create a new server (and provision it)
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now, newId } from '@/lib/db'
import { requireAuth, requireEditor } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { getCfCredentials, provisionServer, getZoneForSubdomain } from '@/lib/cloudflare'
import { checkDnsConflict } from '@/lib/cloudflare/dns'
import { audit } from '@/lib/auth'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbServer, DbServerWithTunnel, DbTunnel } from '@/lib/db'

function attachTunnel(server: DbServer): DbServerWithTunnel {
  if (!server.tunnelId) return { ...server, tunnel: null }
  const tunnel = db.prepare(
    'SELECT "id", "name", "cfTunnelId", "status" FROM "Tunnel" WHERE "id" = ?'
  ).get(server.tunnelId) as Pick<DbTunnel, 'id' | 'name' | 'cfTunnelId' | 'status'> | undefined
  return { ...server, tunnel: tunnel ?? null }
}

// ─── GET /api/servers ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('q')?.toLowerCase()
    const statusFilter = searchParams.get('status')
    const tunnelFilter = searchParams.get('tunnelId')

    let query = 'SELECT * FROM "Server" WHERE ("userId" = ? OR "userId" IS NULL)'
    const args: (string | null)[] = [wsId]

    if (search) {
      query += ` AND (lower("name") LIKE ? OR lower("subdomain") LIKE ? OR lower("upstream") LIKE ?)`
      const like = `%${search}%`
      args.push(like, like, like)
    }
    if (statusFilter) { query += ` AND "status" = ?`; args.push(statusFilter) }
    if (tunnelFilter) { query += ` AND "tunnelId" = ?`; args.push(tunnelFilter) }
    query += ` ORDER BY "createdAt" DESC`

    const servers = (db.prepare(query).all(...args) as DbServer[]).map(attachTunnel)
    return ok({ servers })
  } catch (e) {
    return serverError(e)
  }
}

// ─── POST /api/servers ────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(64),
  subdomain: z
    .string()
    .min(1, 'Subdomain is required')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid subdomain format'),
  upstream: z
    .string()
    .min(1, 'Upstream address is required')
    .regex(
      /^(https?:\/\/.+|[a-zA-Z0-9][a-zA-Z0-9._-]*(:[0-9]{1,5})?(\/.*)?)$/,
      'Upstream must be a URL or a bare host/container name (e.g. tunnel-manager:3000)'
    ),
  protocol: z.enum(['http', 'https']).default('http'),
  tunnelId: z.string().optional().nullable(),
  /** Cloudflare zone ID for this server's DNS record (auto-detected from subdomain if omitted) */
  zoneId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  overwriteDns: z.boolean().default(false),
  skipProvision: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  try {
    const session = await requireEditor().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { name, subdomain, upstream, protocol, tunnelId, zoneId: bodyZoneId, notes, overwriteDns, skipProvision } = parsed.data

    // Normalise upstream: add protocol prefix if bare hostname/container name, then strip trailing slash
    const normalizedUpstream = /^https?:\/\//i.test(upstream)
      ? upstream
      : `${protocol}://${upstream}`
    const cleanUpstream = normalizedUpstream.replace(/\/$/, '')

    // Check for subdomain conflict in our DB (across all users — subdomains are globally unique in CF)
    const existingServer = db.prepare('SELECT "id" FROM "Server" WHERE "subdomain" = ?').get(subdomain)
    if (existingServer) {
      return err(
        `A server with subdomain "${subdomain}" already exists in Tunnel Manager.`,
        409,
        'SUBDOMAIN_CONFLICT'
      )
    }

    // Resolve zone for this server (needed for DNS conflict check)
    const { zones, token } = await getCfCredentials(wsId)
    const resolvedZoneId = bodyZoneId ?? getZoneForSubdomain(subdomain, zones)?.id ?? zones[0].id

    // Check for DNS conflict in Cloudflare (unless skip or overwrite)
    if (!skipProvision) {
      const conflict = await checkDnsConflict(resolvedZoneId, subdomain, token)
      if (conflict.hasConflict && !overwriteDns) {
        return ok(
          {
            conflict: true,
            existingRecord: {
              id: conflict.existing?.id,
              type: conflict.existing?.type,
              content: conflict.existing?.content,
            },
            message: `DNS record already exists for "${subdomain}". Set overwriteDns: true to replace it.`,
          },
          409
        )
      }
    }

    if (tunnelId) {
      const tunnel = db.prepare(
        'SELECT "id" FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
      ).get(tunnelId, wsId)
      if (!tunnel) return err('Specified tunnel not found.', 422)
    }

    const ts = now(); const id = newId()
    db.prepare(`
      INSERT INTO "Server" ("id", "name", "subdomain", "upstream", "protocol", "tunnelId", "zoneId", "userId", "notes", "status", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, name, subdomain, cleanUpstream, protocol, tunnelId ?? null, resolvedZoneId, wsId, notes ?? null, ts, ts)

    const server = attachTunnel(db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(id) as DbServer)

    await audit({ action: 'CREATE_SERVER', resource: 'server', resourceId: server.id, details: { name, subdomain, upstream: cleanUpstream, tunnelId }, userId: session.userId, ipAddress: getClientIp(request) })

    if (!skipProvision && tunnelId) {
      try {
        const provisioned = await provisionServer(server.id, wsId)
        await audit({ action: 'PROVISION_SERVER', resource: 'server', resourceId: server.id, details: { subdomain, tunnelId }, userId: session.userId, ipAddress: getClientIp(request) })
        return ok({ server: provisioned }, 201)
      } catch (provErr) {
        db.prepare('UPDATE "Server" SET "status" = \'error\', "updatedAt" = ? WHERE "id" = ?').run(now(), server.id)
        return ok({ server: { ...server, status: 'error' }, warning: `Server created but provisioning failed: ${provErr instanceof Error ? provErr.message : 'Unknown error'}` }, 201)
      }
    }

    return ok({ server }, 201)
  } catch (e) {
    return serverError(e)
  }
}
