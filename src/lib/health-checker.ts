/**
 * Health checker for TunnelFlow servers.
 * Polls each server's upstream URL (HTTP HEAD/GET) and stores results in HealthCheck.
 * Fires server.down / server.up notifications on state transitions.
 */

import { db, now, newId, type DbServer, type DbHealthCheck } from './db'
import { sendNotification } from './notifications'

const TIMEOUT_MS = 10_000  // 10 s per check
const MAX_HISTORY = 100    // keep last N checks per server

export interface HealthResult {
  serverId: string
  status: 'up' | 'down' | 'timeout' | 'error'
  statusCode: number | null
  responseMs: number | null
  error: string | null
}

/** Run a single HTTP health check against an upstream URL. */
export async function checkUpstream(upstream: string): Promise<Omit<HealthResult, 'serverId'>> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Try HEAD first (cheap), then fall back to GET for services that reject HEAD.
    let res = await fetch(upstream, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })

    if (res.status === 405 || res.status === 501) {
      res = await fetch(upstream, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      })
    }

    clearTimeout(timer)
    const responseMs = Date.now() - start

    // Any HTTP response means the service is reachable through the network path.
    // Reserve down/error for true network failures or timeouts.
    const status = 'up'
    return { status, statusCode: res.status, responseMs, error: null }
  } catch (err: unknown) {
    clearTimeout(timer)
    const responseMs = Date.now() - start
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'timeout', statusCode: null, responseMs, error: 'Request timed out' }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', statusCode: null, responseMs, error: msg }
  }
}

/** Record a health check result in the DB. Prunes old rows. */
function recordCheck(result: HealthResult): void {
  const id = newId()
  db.prepare(`
    INSERT INTO "HealthCheck" ("id", "serverId", "status", "statusCode", "responseMs", "error", "checkedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, result.serverId, result.status, result.statusCode, result.responseMs, result.error, now())

  // Prune old rows beyond MAX_HISTORY
  db.prepare(`
    DELETE FROM "HealthCheck"
    WHERE "serverId" = ?
    AND "id" NOT IN (
      SELECT "id" FROM "HealthCheck" WHERE "serverId" = ?
      ORDER BY "checkedAt" DESC LIMIT ?
    )
  `).run(result.serverId, result.serverId, MAX_HISTORY)
}

/** Return the most recent health check row for a server. */
export function getLatestHealthCheck(serverId: string): DbHealthCheck | null {
  return (
    db
      .prepare('SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT 1')
      .get(serverId) as DbHealthCheck | undefined
  ) ?? null
}

/** Return the last N health checks for a server (newest first). */
export function getHealthHistory(serverId: string, limit = 50): DbHealthCheck[] {
  return db
    .prepare('SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT ?')
    .all(serverId, limit) as DbHealthCheck[]
}

/**
 * Run health checks for all active servers in a workspace.
 * Fires server.down / server.up notifications on state transitions.
 */
export async function runHealthChecks(workspaceOwnerId: string): Promise<HealthResult[]> {
  const servers = db
    .prepare(`SELECT * FROM "Server" WHERE ("userId" = ? OR "userId" IS NULL) AND "status" = 'active'`)
    .all(workspaceOwnerId) as DbServer[]

  const results = await Promise.all(
    servers.map(async (server) => {
      let result: HealthResult = {
        serverId: server.id,
        ...(await checkUpstream(server.upstream)),
      }

      // If direct upstream is not reachable from TunnelFlow's runtime network,
      // fall back to the public route check. This avoids false negatives when
      // upstream hostnames are only resolvable inside another Docker network.
      if (result.status !== 'up' && server.subdomain) {
        try {
          const publicResult = await checkUpstream(`https://${server.subdomain}`)
          if (publicResult.status === 'up') {
            result = {
              serverId: server.id,
              ...publicResult,
            }
          }
        } catch {
          // Keep original upstream failure result
        }
      }

      const prev = getLatestHealthCheck(server.id)
      recordCheck(result)

      // Detect state transitions for notifications
      const wasUp = !prev || prev.status === 'up'
      const isUp = result.status === 'up'

      if (wasUp && !isUp) {
        // Transition: up → down
        sendNotification(
          {
            event: 'server.down',
            title: `Server Down: ${server.name}`,
            body: `The upstream for **${server.name}** (${server.upstream}) is unreachable.`,
            fields: {
              Server:   server.name,
              Upstream: server.upstream,
              Status:   result.status,
              Error:    result.error ?? '(none)',
            },
          },
          workspaceOwnerId
        ).catch(() => null)
      } else if (!wasUp && isUp) {
        // Transition: down → up
        sendNotification(
          {
            event: 'server.up',
            title: `Server Recovered: ${server.name}`,
            body: `The upstream for **${server.name}** (${server.upstream}) is back online.`,
            fields: {
              Server:      server.name,
              Upstream:    server.upstream,
              'Response':  `${result.responseMs}ms`,
            },
          },
          workspaceOwnerId
        ).catch(() => null)
      }

      return result
    })
  )

  return results
}

/** Check whether a server is currently in a maintenance window. */
export function isInMaintenanceWindow(serverId: string): boolean {
  const nowIso = new Date().toISOString()
  const row = db.prepare(`
    SELECT 1 FROM "MaintenanceWindow"
    WHERE "serverId" = ?
      AND "startsAt" <= ?
      AND "endsAt" >= ?
    LIMIT 1
  `).get(serverId, nowIso, nowIso)
  return Boolean(row)
}
