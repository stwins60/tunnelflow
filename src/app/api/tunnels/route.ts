/**
 * GET  /api/tunnels       — list tunnels for the authenticated user
 * POST /api/tunnels       — create a new tunnel
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db, now, newId } from '@/lib/db'
import { requireAuth, requireEditor } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { getCfCredentials } from '@/lib/cloudflare'
import { createTunnel, listTunnels, normalizeTunnelStatus } from '@/lib/cloudflare/tunnels'
import { audit } from '@/lib/auth'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'
import type { DbTunnel, DbServer } from '@/lib/db'

// ─── GET /api/tunnels ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)

    const tunnels = db.prepare(`
      SELECT * FROM "Tunnel" WHERE "userId" = ? ORDER BY "createdAt" DESC
    `).all(wsId) as DbTunnel[]

    // Also include legacy tunnels with no userId (backward compat)
    const legacyTunnels = db.prepare(`
      SELECT * FROM "Tunnel" WHERE "userId" IS NULL ORDER BY "createdAt" DESC
    `).all() as DbTunnel[]

    const allTunnels = [...tunnels, ...legacyTunnels]

    const result = allTunnels.map((t) => ({
      ...t,
      servers: db.prepare('SELECT * FROM "Server" WHERE "tunnelId" = ?').all(t.id) as DbServer[],
    }))

    return ok({ tunnels: result })
  } catch (e) {
    return serverError(e)
  }
}

// ─── POST /api/tunnels ────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(64, 'Name too long')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Name may only contain letters, numbers, hyphens, and underscores'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await requireEditor().catch(() => null)
    if (!session) return unauthorized()

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { name } = parsed.data
    const wsId = resolveWorkspaceId(session.userId!)
    const { token, accountId } = await getCfCredentials(wsId)

    const { tunnel: cfTunnel } = await createTunnel({ accountId, name }, token)

    const ts = now(); const id = newId()
    db.prepare(`
      INSERT INTO "Tunnel" ("id", "cfTunnelId", "name", "accountId", "userId", "status", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, 'inactive', ?, ?)
    `).run(id, cfTunnel.id, cfTunnel.name, accountId, wsId, ts, ts)

    const dbTunnel = db.prepare('SELECT * FROM "Tunnel" WHERE "id" = ?').get(id) as DbTunnel

    await audit({ action: 'CREATE_TUNNEL', resource: 'tunnel', resourceId: dbTunnel.id, details: { name, cfTunnelId: cfTunnel.id }, userId: session.userId, ipAddress: getClientIp(request) })

    return ok({ tunnel: dbTunnel }, 201)
  } catch (e) {
    return serverError(e)
  }
}
