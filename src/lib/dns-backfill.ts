/**
 * Backfill DNS records from Cloudflare into the local tracking table.
 * Fetches all CNAME records for every configured zone and imports any
 * that are not already tracked, matching them to servers by subdomain.
 */

import { db, newId, now } from './db'
import { getCfCredentials } from './cloudflare'
import { listDnsRecords } from './cloudflare/dns'

export async function backfillDnsRecords(userId?: string | null): Promise<{
  imported: number
  skipped: number
  errors: string[]
}> {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    const { token, zones } = await getCfCredentials(userId)

    for (const zone of zones) {
      try {
        // Fetch all CNAME records for this zone from Cloudflare
        const cfRecords = await listDnsRecords(zone.id, { type: 'CNAME' }, token)
        console.log(`[backfill] Zone ${zone.name}: ${cfRecords.length} CNAME record(s) found`)

        for (const record of cfRecords) {
          try {
            // Check if already tracked
            const existing = db.prepare(
              'SELECT id, userId FROM "DnsRecord" WHERE "cfRecordId" = ?'
            ).get(record.id) as { id: string; userId: string | null } | undefined

            if (existing) {
              // Claim ownership if record has no userId yet
              if (!existing.userId && userId) {
                db.prepare('UPDATE "DnsRecord" SET "userId" = ?, "zoneName" = ?, "updatedAt" = ? WHERE "id" = ?')
                  .run(userId, zone.name, now(), existing.id)
              }
              results.skipped++
              continue
            }

            // Try to match to a local server by subdomain
            const server = db.prepare(
              'SELECT id, userId FROM "Server" WHERE "subdomain" = ? LIMIT 1'
            ).get(record.name) as { id: string; userId: string | null } | undefined

            const id = newId()
            const ts = now()

            db.prepare(`
              INSERT INTO "DnsRecord" (
                "id", "cfRecordId", "zoneId", "zoneName", "name", "type", "content",
                "proxied", "ttl", "serverId", "userId", "status", "deletedAt",
                "createdAt", "updatedAt"
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)
            `).run(
              id,
              record.id,
              zone.id,
              zone.name,
              record.name,
              record.type,
              record.content,
              record.proxied ? 1 : 0,
              record.ttl,
              server?.id ?? null,
              server?.userId ?? userId ?? null,
              record.created_on ?? ts,
              ts
            )

            // Also update the server's dnsRecordId if it was missing
            if (server) {
              db.prepare(
                'UPDATE "Server" SET "dnsRecordId" = ?, "zoneId" = ?, "updatedAt" = ? WHERE "id" = ? AND ("dnsRecordId" IS NULL OR "dnsRecordId" = \'\')'
              ).run(record.id, zone.id, ts, server.id)
            }

            const auditId = newId()
            db.prepare(`
              INSERT INTO "AuditLog" (
                "id", "action", "resource", "resourceId", "details", "before", "after",
                "userId", "ipAddress", "createdAt"
              ) VALUES (?, 'DNS_RECORD_BACKFILLED', 'dns_record', ?, ?, NULL, ?, ?, 'system', ?)
            `).run(
              auditId,
              id,
              JSON.stringify({ name: record.name, zone: zone.name, serverId: server?.id ?? null }),
              JSON.stringify({ id, cfRecordId: record.id, name: record.name }),
              server?.userId ?? userId ?? null,
              ts
            )

            results.imported++
            console.log(`[backfill] Imported: ${record.name} (${record.type}) in zone ${zone.name}`)
          } catch (err) {
            results.errors.push(`${record.name}: ${err}`)
            console.error(`[backfill] Error importing ${record.name}:`, err)
          }
        }
      } catch (err) {
        results.errors.push(`Zone ${zone.name}: ${err}`)
        console.error(`[backfill] Error fetching zone ${zone.name}:`, err)
      }
    }

    console.log(`[backfill] Done: ${results.imported} imported, ${results.skipped} skipped, ${results.errors.length} errors`)
    return results
  } catch (err) {
    console.error('[backfill] Fatal error:', err)
    results.errors.push(`Fatal: ${err}`)
    return results
  }
}
