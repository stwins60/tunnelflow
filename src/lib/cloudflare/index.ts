/**
 * Cloudflare service barrel export + high-level orchestration functions.
 *
 * This is the main entry point for all Cloudflare operations.
 * Import from here, not from the sub-modules directly.
 */

export * from './client'
export * from './zones'
export * from './tunnels'
export * from './dns'

import { getSetting, SETTING_KEYS } from '@/lib/auth'
import { db, now } from '@/lib/db'
import {
  listTunnels,
  getTunnelConfig,
  normalizeTunnelStatus,
  upsertTunnelRoute,
  removeTunnelRoute,
} from './tunnels'
import {
  createTunnelDnsRecord,
  updateTunnelDnsRecord,
  deleteDnsRecord,
  findDnsRecord,
} from './dns'
import type { AppServer, CfTunnel } from '@/types'
import type { DbServer, DbTunnel, DbServerWithTunnel } from '@/lib/db'

// ─── Credential helpers ───────────────────────────────────────────────────────

export interface CfZone {
  id: string
  name: string
}

/**
 * Load Cloudflare credentials from the settings store for a specific user.
 * Returns all configured zones. Falls back gracefully from CF_ZONES → legacy CF_ZONE_ID/CF_ZONE_NAME.
 */
export async function getCfCredentials(userId?: string | null): Promise<{
  token: string
  accountId: string
  zones: CfZone[]
  /** First zone — convenience accessor for single-zone callers */
  zoneId: string
  zoneName: string
}> {
  const [token, accountId, cfZonesRaw, legacyZoneId, legacyZoneName] = await Promise.all([
    getSetting(SETTING_KEYS.CF_API_TOKEN, userId),
    getSetting(SETTING_KEYS.CF_ACCOUNT_ID, userId),
    getSetting(SETTING_KEYS.CF_ZONES, userId),
    getSetting(SETTING_KEYS.CF_ZONE_ID, userId),
    getSetting(SETTING_KEYS.CF_ZONE_NAME, userId),
  ])

  if (!token || !accountId) {
    throw new Error('Cloudflare credentials not configured. Complete setup first.')
  }

  let zones: CfZone[] = []
  if (cfZonesRaw) {
    try {
      zones = JSON.parse(cfZonesRaw) as CfZone[]
    } catch {
      // fall through to legacy
    }
  }
  // Fall back to legacy single-zone keys
  if (zones.length === 0 && legacyZoneId && legacyZoneName) {
    zones = [{ id: legacyZoneId, name: legacyZoneName }]
  }

  if (zones.length === 0) {
    throw new Error('No Cloudflare zones configured. Complete setup first.')
  }

  return { token, accountId, zones, zoneId: zones[0].id, zoneName: zones[0].name }
}

/**
 * Given a fully-qualified hostname (e.g. "app.example.com"), return the best-matching
 * zone from the configured list. Matches by longest zone name suffix.
 * Returns null if no zone matches.
 */
export function getZoneForSubdomain(subdomain: string, zones: CfZone[]): CfZone | null {
  const lower = subdomain.toLowerCase()
  let best: CfZone | null = null
  for (const zone of zones) {
    const zn = zone.name.toLowerCase()
    if (lower === zn || lower.endsWith(`.${zn}`)) {
      if (!best || zone.name.length > best.name.length) {
        best = zone
      }
    }
  }
  return best
}

// ─── Server provisioning (one-click) ─────────────────────────────────────────

/**
 * Provision a server: upsert tunnel ingress route + create/update DNS record.
 * Updates the Server record in the database with the resulting IDs and status.
 */
export async function provisionServer(serverId: string, userId?: string | null): Promise<AppServer> {
  const server = db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(serverId) as DbServer | undefined
  if (!server) throw new Error(`Server ${serverId} not found.`)

  if (!server.tunnelId) throw new Error(`Server ${serverId} has no tunnel assigned.`)

  const tunnel = db.prepare('SELECT * FROM "Tunnel" WHERE "id" = ?').get(server.tunnelId) as DbTunnel | undefined
  if (!tunnel) throw new Error(`Tunnel ${server.tunnelId} not found.`)

  // Resolve userId: prefer explicit arg, fall back to tunnel's userId, then server's userId
  const effectiveUserId = userId ?? tunnel.userId ?? server.userId ?? null

  const { token, accountId, zones } = await getCfCredentials(effectiveUserId)
  const cfTunnelId = tunnel.cfTunnelId
  // upstream is stored as a full URL (e.g. "http://host:port"); avoid double-prepending the protocol
  const service = /^https?:\/\//i.test(server.upstream)
    ? server.upstream
    : `${server.protocol}://${server.upstream}`

  // Resolve zone: use the server's stored zoneId, or auto-detect from subdomain, or fall back to first zone
  const resolvedZoneId =
    server.zoneId ??
    getZoneForSubdomain(server.subdomain, zones)?.id ??
    zones[0].id

  // 1. Upsert ingress rule
  await upsertTunnelRoute(accountId, cfTunnelId, server.subdomain, service, undefined, token)

  // 2. Upsert DNS record — always look up by name so we never double-POST
  const existing = await findDnsRecord(resolvedZoneId, server.subdomain, token)
  let dnsRecordId = existing?.id ?? server.dnsRecordId ?? null

  if (existing) {
    await updateTunnelDnsRecord(resolvedZoneId, existing.id, server.subdomain, cfTunnelId, token)
  } else {
    const newRecord = await createTunnelDnsRecord(
      { zoneId: resolvedZoneId, name: server.subdomain, tunnelId: cfTunnelId },
      token
    )
    dnsRecordId = newRecord.id
  }

  // 3. Update DB
  db.prepare(`
    UPDATE "Server"
    SET "dnsRecordId" = ?, "status" = 'active', "lastSyncAt" = ?, "updatedAt" = ?
    WHERE "id" = ?
  `).run(dnsRecordId, now(), now(), serverId)

  const updatedServer = db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(serverId) as DbServer
  const result: DbServerWithTunnel = { ...updatedServer, tunnel: { id: tunnel.id, name: tunnel.name, cfTunnelId: tunnel.cfTunnelId, status: tunnel.status } }

  return result as unknown as AppServer
}

/**
 * Deprovision a server: remove ingress route + DNS record.
 * Updates the Server record to 'pending' status.
 */
export async function deprovisionServer(serverId: string, userId?: string | null): Promise<void> {
  const server = db.prepare('SELECT * FROM "Server" WHERE "id" = ?').get(serverId) as DbServer | undefined
  if (!server) throw new Error(`Server ${serverId} not found.`)

  const tunnel = server.tunnelId
    ? (db.prepare('SELECT * FROM "Tunnel" WHERE "id" = ?').get(server.tunnelId) as DbTunnel | undefined)
    : null

  const effectiveUserId = userId ?? tunnel?.userId ?? server.userId ?? null
  const { token, accountId, zones } = await getCfCredentials(effectiveUserId)

  const resolvedZoneId =
    server.zoneId ??
    getZoneForSubdomain(server.subdomain, zones)?.id ??
    zones[0].id

  // Remove ingress rule if tunnel exists
  if (tunnel) {
    try {
      await removeTunnelRoute(accountId, tunnel.cfTunnelId, server.subdomain, token)
    } catch (err) {
      console.error(`[cf] Failed to remove ingress route for ${server.subdomain}:`, err)
    }
  }

  // Remove DNS record
  if (server.dnsRecordId) {
    try {
      await deleteDnsRecord(resolvedZoneId, server.dnsRecordId, token)
    } catch (err) {
      console.error(`[cf] Failed to delete DNS record for ${server.subdomain}:`, err)
    }
  }

  db.prepare(`
    UPDATE "Server" SET "status" = 'pending', "dnsRecordId" = NULL, "lastSyncAt" = ?, "updatedAt" = ?
    WHERE "id" = ?
  `).run(now(), now(), serverId)
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Reconcile the database state with live Cloudflare state for a specific user.
 * Updates tunnel statuses and detects drift.
 */
export async function syncWithCloudflare(userId?: string | null): Promise<{
  tunnelsUpdated: number
  driftDetected: string[]
}> {
  const { token, accountId } = await getCfCredentials(userId)

  const dbTunnels = userId
    ? db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ?').all(userId) as DbTunnel[]
    : db.prepare('SELECT * FROM "Tunnel" WHERE "userId" IS NULL').all() as DbTunnel[]

  const liveTunnels: CfTunnel[] = await listTunnels(accountId, token)

  const liveMap = new Map<string, CfTunnel>(liveTunnels.map((t) => [t.id, t]))
  const driftDetected: string[] = []
  let tunnelsUpdated = 0

  for (const dbTunnel of dbTunnels) {
    const live = liveMap.get(dbTunnel.cfTunnelId)
    const servers = db.prepare('SELECT * FROM "Server" WHERE "tunnelId" = ?').all(dbTunnel.id) as DbServer[]

    if (!live) {
      // Tunnel deleted in Cloudflare but not in DB
      driftDetected.push(`Tunnel "${dbTunnel.name}" (${dbTunnel.cfTunnelId}) not found in Cloudflare`)
      db.prepare('UPDATE "Tunnel" SET "status" = \'error\', "lastSyncAt" = ?, "updatedAt" = ? WHERE "id" = ?')
        .run(now(), now(), dbTunnel.id)
      tunnelsUpdated++
      continue
    }

    const newStatus = normalizeTunnelStatus(live)
    const ts = now()
    db.prepare('UPDATE "Tunnel" SET "status" = ?, "lastSyncAt" = ?, "updatedAt" = ? WHERE "id" = ?')
      .run(newStatus, ts, ts, dbTunnel.id)
    if (newStatus !== dbTunnel.status) tunnelsUpdated++

    // Check ingress rules for drift
    try {
      const config = await getTunnelConfig(accountId, live.id, token)
      const liveHostnames = new Set(
        (config.config?.ingress ?? [])
          .filter((r) => r.hostname)
          .map((r) => r.hostname!)
      )

      for (const server of servers) {
        if (server.status === 'active' && !liveHostnames.has(server.subdomain)) {
          driftDetected.push(
            `Server "${server.name}" hostname ${server.subdomain} missing from tunnel config`
          )
          db.prepare('UPDATE "Server" SET "status" = \'error\', "updatedAt" = ? WHERE "id" = ?')
            .run(now(), server.id)
        }
      }
    } catch {
      // Ignore config fetch errors during sync
    }
  }

  return { tunnelsUpdated, driftDetected }
}
