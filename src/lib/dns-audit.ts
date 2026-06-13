/**
 * DNS Record audit logging and tracking utilities.
 * Logs all CNAME creation, update, and deletion operations for visibility.
 */

import { db, newId, now, type DbDnsRecord } from './db'
import type { CfDnsRecord } from '@/types'

/**
 * Log a DNS record creation to the database and audit log.
 */
export function logDnsRecordCreated(params: {
  cfRecord: CfDnsRecord
  zoneName: string | null
  /** Fallback zone ID used when cfRecord.zone_id is absent (some CF endpoints omit it) */
  zoneId?: string | null
  serverId?: string | null
  userId?: string | null
  ipAddress?: string | null
}): DbDnsRecord {
  const { cfRecord, zoneName, zoneId: fallbackZoneId, serverId, userId, ipAddress } = params
  const resolvedZoneId = cfRecord.zone_id || fallbackZoneId || ''
  const ts = now()
  const id = newId()

  const dnsRecord: DbDnsRecord = {
    id,
    cfRecordId: cfRecord.id,
    zoneId: resolvedZoneId,
    zoneName,
    name: cfRecord.name,
    type: cfRecord.type,
    content: cfRecord.content,
    proxied: cfRecord.proxied ?? false,
    ttl: cfRecord.ttl ?? 1,
    serverId: serverId ?? null,
    userId: userId ?? null,
    status: 'active',
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
  }

  // Insert DNS record
  db.prepare(`
    INSERT INTO "DnsRecord" (
      "id", "cfRecordId", "zoneId", "zoneName", "name", "type", "content",
      "proxied", "ttl", "serverId", "userId", "status", "deletedAt",
      "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, cfRecord.id, resolvedZoneId, zoneName, cfRecord.name, cfRecord.type,
    cfRecord.content, cfRecord.proxied ? 1 : 0, cfRecord.ttl ?? 1,
    serverId ?? null, userId ?? null, 'active', null, ts, ts
  )

  // Log to audit
  const auditId = newId()
  db.prepare(`
    INSERT INTO "AuditLog" (
      "id", "action", "resource", "resourceId", "details", "before", "after",
      "userId", "ipAddress", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    'DNS_RECORD_CREATED',
    'dns_record',
    id,
    JSON.stringify({ name: cfRecord.name, type: cfRecord.type, content: cfRecord.content }),
    null,
    JSON.stringify(dnsRecord),
    userId ?? null,
    ipAddress ?? null,
    ts
  )

  return dnsRecord
}

/**
 * Log a DNS record update to the audit log.
 */
export function logDnsRecordUpdated(params: {
  recordId: string
  cfRecord: CfDnsRecord
  before: Partial<DbDnsRecord>
  userId?: string | null
  ipAddress?: string | null
}): void {
  const { recordId, cfRecord, before, userId, ipAddress } = params
  const ts = now()

  // Update DNS record
  db.prepare(`
    UPDATE "DnsRecord"
    SET "content" = ?, "proxied" = ?, "ttl" = ?, "updatedAt" = ?
    WHERE "id" = ?
  `).run(cfRecord.content, cfRecord.proxied ? 1 : 0, cfRecord.ttl ?? 1, ts, recordId)

  // Get updated record
  const after = db.prepare('SELECT * FROM "DnsRecord" WHERE "id" = ?').get(recordId) as DbDnsRecord | undefined

  // Log to audit
  const auditId = newId()
  db.prepare(`
    INSERT INTO "AuditLog" (
      "id", "action", "resource", "resourceId", "details", "before", "after",
      "userId", "ipAddress", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    'DNS_RECORD_UPDATED',
    'dns_record',
    recordId,
    JSON.stringify({ name: cfRecord.name, type: cfRecord.type }),
    JSON.stringify(before),
    JSON.stringify(after),
    userId ?? null,
    ipAddress ?? null,
    ts
  )
}

/**
 * Log a DNS record deletion to the audit log.
 */
export function logDnsRecordDeleted(params: {
  cfRecordId: string
  zoneId: string
  name?: string
  userId?: string | null
  ipAddress?: string | null
}): void {
  const { cfRecordId, zoneId, name, userId, ipAddress } = params
  const ts = now()

  // Find existing record
  const existing = db.prepare(
    'SELECT * FROM "DnsRecord" WHERE "cfRecordId" = ? AND "zoneId" = ? AND "status" = \'active\''
  ).get(cfRecordId, zoneId) as DbDnsRecord | undefined

  if (existing) {
    // Mark as deleted
    db.prepare(`
      UPDATE "DnsRecord"
      SET "status" = 'deleted', "deletedAt" = ?, "updatedAt" = ?
      WHERE "id" = ?
    `).run(ts, ts, existing.id)

    // Log to audit
    const auditId = newId()
    db.prepare(`
      INSERT INTO "AuditLog" (
        "id", "action", "resource", "resourceId", "details", "before", "after",
        "userId", "ipAddress", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      'DNS_RECORD_DELETED',
      'dns_record',
      existing.id,
      JSON.stringify({ name: existing.name, type: existing.type, content: existing.content }),
      JSON.stringify(existing),
      null,
      userId ?? null,
      ipAddress ?? null,
      ts
    )
  } else if (name) {
    // Record not in our DB, but log the deletion anyway
    const auditId = newId()
    db.prepare(`
      INSERT INTO "AuditLog" (
        "id", "action", "resource", "resourceId", "details", "before", "after",
        "userId", "ipAddress", "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      'DNS_RECORD_DELETED',
      'dns_record',
      null,
      JSON.stringify({ cfRecordId, zoneId, name }),
      null,
      null,
      userId ?? null,
      ipAddress ?? null,
      ts
    )
  }
}

/**
 * Get all DNS records, optionally filtered by status.
 */
export function getDnsRecords(filters?: {
  status?: 'active' | 'deleted' | 'all'
  zoneId?: string
  serverId?: string
  userId?: string
  limit?: number
}): DbDnsRecord[] {
  try {
    const { status = 'all', zoneId, serverId, userId, limit = 100 } = filters ?? {}

    let query = 'SELECT * FROM "DnsRecord" WHERE 1=1'
    const params: (string | number)[] = []

    if (status !== 'all') {
      query += ' AND "status" = ?'
      params.push(status)
    }

    if (zoneId) {
      query += ' AND "zoneId" = ?'
      params.push(zoneId)
    }

    if (serverId) {
      query += ' AND "serverId" = ?'
      params.push(serverId)
    }

    if (userId) {
      query += ' AND "userId" = ?'
      params.push(userId)
    }

    query += ' ORDER BY "createdAt" DESC LIMIT ?'
    params.push(limit)

    return db.prepare(query).all(...params) as DbDnsRecord[]
  } catch (err) {
    console.error('[dns-audit] Error fetching DNS records:', err)
    return []
  }
}

/**
 * Get DNS record by Cloudflare record ID.
 */
export function getDnsRecordByCfId(cfRecordId: string, zoneId: string): DbDnsRecord | null {
  return (db.prepare(
    'SELECT * FROM "DnsRecord" WHERE "cfRecordId" = ? AND "zoneId" = ?'
  ).get(cfRecordId, zoneId) as DbDnsRecord | undefined) ?? null
}

/**
 * Get DNS records with audit history.
 */
export function getDnsRecordsWithHistory(filters?: {
  status?: 'active' | 'deleted' | 'all'
  limit?: number
}): Array<DbDnsRecord & { auditLogs: Array<{ action: string; createdAt: string; userEmail: string | null }> }> {
  try {
    const records = getDnsRecords(filters)

    return records.map((record) => {
      try {
        const auditLogs = db.prepare(`
          SELECT a.action, a.createdAt, u.email AS userEmail
          FROM "AuditLog" a
          LEFT JOIN "User" u ON u.id = a.userId
          WHERE a.resource = 'dns_record' AND a.resourceId = ?
          ORDER BY a.createdAt DESC
        `).all(record.id) as Array<{ action: string; createdAt: string; userEmail: string | null }>

        return { ...record, auditLogs }
      } catch (err) {
        console.error('[dns-audit] Error fetching audit logs for record:', record.id, err)
        return { ...record, auditLogs: [] }
      }
    })
  } catch (err) {
    console.error('[dns-audit] Error fetching DNS records with history:', err)
    return []
  }
}
