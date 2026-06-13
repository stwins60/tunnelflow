/**
 * One-time migration script to backfill existing DNS records into the tracking table.
 * Run this to import DNS records from existing provisioned servers.
 */

import { db, newId, now } from './db'

export function backfillDnsRecords(): {
  imported: number
  skipped: number
  errors: string[]
} {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // Get all servers that have DNS records
    const servers = db.prepare(`
      SELECT s.*, t.cfTunnelId
      FROM "Server" s
      LEFT JOIN "Tunnel" t ON t.id = s.tunnelId
      WHERE s.dnsRecordId IS NOT NULL AND s.dnsRecordId != ''
    `).all() as Array<{
      id: string
      subdomain: string
      dnsRecordId: string
      zoneId: string | null
      userId: string | null
      createdAt: string
      updatedAt: string
      cfTunnelId: string | null
    }>

    console.log(`[backfill] Found ${servers.length} servers with DNS records`)

    for (const server of servers) {
      try {
        // Check if already tracked
        const existing = db.prepare(
          'SELECT id FROM "DnsRecord" WHERE "cfRecordId" = ?'
        ).get(server.dnsRecordId)

        if (existing) {
          results.skipped++
          continue
        }

        // Calculate content (target)
        const content = server.cfTunnelId
          ? `${server.cfTunnelId}.cfargotunnel.com`
          : 'unknown'

        // Insert into DnsRecord table
        const id = newId()
        const ts = now()

        db.prepare(`
          INSERT INTO "DnsRecord" (
            "id", "cfRecordId", "zoneId", "zoneName", "name", "type", "content",
            "proxied", "ttl", "serverId", "userId", "status", "deletedAt",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          server.dnsRecordId,
          server.zoneId ?? 'unknown',
          null, // zoneName - will be populated on next update
          server.subdomain,
          'CNAME',
          content,
          1, // proxied
          1, // ttl (auto)
          server.id,
          server.userId,
          'active',
          null,
          server.createdAt,
          ts
        )

        // Create audit log for the backfill
        const auditId = newId()
        db.prepare(`
          INSERT INTO "AuditLog" (
            "id", "action", "resource", "resourceId", "details", "before", "after",
            "userId", "ipAddress", "createdAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          auditId,
          'DNS_RECORD_BACKFILLED',
          'dns_record',
          id,
          JSON.stringify({ name: server.subdomain, serverId: server.id }),
          null,
          JSON.stringify({ id, cfRecordId: server.dnsRecordId, name: server.subdomain }),
          server.userId,
          'system',
          ts
        )

        results.imported++
        console.log(`[backfill] Imported DNS record for server: ${server.subdomain}`)
      } catch (err) {
        results.errors.push(`Server ${server.subdomain}: ${err}`)
        console.error(`[backfill] Error importing record for ${server.subdomain}:`, err)
      }
    }

    console.log(`[backfill] Complete: ${results.imported} imported, ${results.skipped} skipped, ${results.errors.length} errors`)
    return results
  } catch (err) {
    console.error('[backfill] Fatal error:', err)
    results.errors.push(`Fatal: ${err}`)
    return results
  }
}
