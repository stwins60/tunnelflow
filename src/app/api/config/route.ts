/**
 * GET  /api/config/export  — export current workspace config as YAML
 * POST /api/config/import  — preview diff then apply YAML config
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, newId, type DbServer, type DbTunnel } from '@/lib/db'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'
import yaml from 'js-yaml'

interface ConfigServer {
  name: string
  subdomain: string
  upstream: string
  protocol: string
  notes?: string
  tunnel?: string  // tunnel name reference
}

interface ConfigTunnel {
  name: string
  cfTunnelId: string
  accountId: string
}

interface WorkspaceConfig {
  version: 1
  tunnels: ConfigTunnel[]
  servers: ConfigServer[]
}

export async function GET() {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)

    const tunnels = db
      .prepare('SELECT * FROM "Tunnel" WHERE "userId" = ?')
      .all(wsId) as DbTunnel[]

    const servers = db
      .prepare('SELECT s.*, t."name" AS tunnelName FROM "Server" s LEFT JOIN "Tunnel" t ON s."tunnelId" = t."id" WHERE s."userId" = ?')
      .all(wsId) as (DbServer & { tunnelName: string | null })[]

    const config: WorkspaceConfig = {
      version: 1,
      tunnels: tunnels.map((t) => ({
        name: t.name,
        cfTunnelId: t.cfTunnelId,
        accountId: t.accountId,
      })),
      servers: servers.map((s) => ({
        name: s.name,
        subdomain: s.subdomain,
        upstream: s.upstream,
        protocol: s.protocol,
        ...(s.notes ? { notes: s.notes } : {}),
        ...(s.tunnelName ? { tunnel: s.tunnelName } : {}),
      })),
    }

    const yamlStr = yaml.dump(config, { lineWidth: 120 })

    return new Response(yamlStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/yaml',
        'Content-Disposition': 'attachment; filename="tunnelflow-config.yaml"',
      },
    })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)

    const body = await req.json()
    const { yamlContent, apply = false } = body

    if (!yamlContent || typeof yamlContent !== 'string') {
      return err('yamlContent is required')
    }

    let config: WorkspaceConfig
    try {
      config = yaml.load(yamlContent) as WorkspaceConfig
    } catch (parseErr) {
      return err(`YAML parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
    }

    if (config?.version !== 1) {
      return err('Unsupported config version. Expected version: 1')
    }

    // ─── Compute diff ────────────────────────────────────────────────────────

    const existingTunnels = db
      .prepare('SELECT * FROM "Tunnel" WHERE "userId" = ?')
      .all(wsId) as DbTunnel[]
    const existingServers = db
      .prepare('SELECT * FROM "Server" WHERE "userId" = ?')
      .all(wsId) as DbServer[]

    const tunnelByName = new Map(existingTunnels.map((t) => [t.name, t]))
    const serverBySubdomain = new Map(existingServers.map((s) => [s.subdomain, s]))

    const diff: {
      tunnels: { action: 'create' | 'update' | 'skip'; name: string }[]
      servers: { action: 'create' | 'update' | 'skip'; subdomain: string; name: string }[]
    } = { tunnels: [], servers: [] }

    for (const t of config.tunnels ?? []) {
      if (tunnelByName.has(t.name)) {
        diff.tunnels.push({ action: 'update', name: t.name })
      } else {
        diff.tunnels.push({ action: 'create', name: t.name })
      }
    }

    for (const s of config.servers ?? []) {
      if (serverBySubdomain.has(s.subdomain)) {
        diff.servers.push({ action: 'update', subdomain: s.subdomain, name: s.name })
      } else {
        diff.servers.push({ action: 'create', subdomain: s.subdomain, name: s.name })
      }
    }

    if (!apply) {
      return ok({ diff, wouldApply: true })
    }

    // ─── Apply ───────────────────────────────────────────────────────────────

    const ts = now()
    const tunnelNameToId = new Map<string, string>()

    // Upsert tunnels
    for (const t of config.tunnels ?? []) {
      const existing = tunnelByName.get(t.name)
      if (existing) {
        db.prepare(`
          UPDATE "Tunnel" SET "cfTunnelId" = ?, "accountId" = ?, "updatedAt" = ? WHERE "id" = ?
        `).run(t.cfTunnelId, t.accountId, ts, existing.id)
        tunnelNameToId.set(t.name, existing.id)
      } else {
        const id = newId()
        db.prepare(`
          INSERT INTO "Tunnel" ("id", "cfTunnelId", "name", "accountId", "status", "userId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, 'inactive', ?, ?, ?)
        `).run(id, t.cfTunnelId, t.name, t.accountId, wsId, ts, ts)
        tunnelNameToId.set(t.name, id)
      }
    }

    // Upsert servers
    for (const s of config.servers ?? []) {
      const tunnelId = s.tunnel ? (tunnelNameToId.get(s.tunnel) ?? null) : null
      const existing = serverBySubdomain.get(s.subdomain)
      if (existing) {
        db.prepare(`
          UPDATE "Server"
          SET "name" = ?, "upstream" = ?, "protocol" = ?, "notes" = ?, "tunnelId" = ?, "updatedAt" = ?
          WHERE "id" = ?
        `).run(s.name, s.upstream, s.protocol ?? 'http', s.notes ?? null, tunnelId, ts, existing.id)
      } else {
        const id = newId()
        db.prepare(`
          INSERT INTO "Server" ("id", "name", "subdomain", "upstream", "protocol", "tunnelId", "notes", "status", "userId", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `).run(id, s.name, s.subdomain, s.upstream, s.protocol ?? 'http', tunnelId, s.notes ?? null, wsId, ts, ts)
      }
    }

    await audit({
      action: 'IMPORT_CONFIG',
      resource: 'Workspace',
      details: {
        tunnelsCreated: diff.tunnels.filter((t) => t.action === 'create').length,
        tunnelsUpdated: diff.tunnels.filter((t) => t.action === 'update').length,
        serversCreated: diff.servers.filter((s) => s.action === 'create').length,
        serversUpdated: diff.servers.filter((s) => s.action === 'update').length,
      },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ applied: true, diff })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}
