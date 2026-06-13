/**
 * GET /api/dns-records
 * Returns DNS records with audit history (admin only, paginated).
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import { getDnsRecords, getDnsRecordsWithHistory } from '@/lib/dns-audit'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') ?? 'all') as 'active' | 'deleted' | 'all'
    const withHistory = searchParams.get('withHistory') === 'true'
    const zoneId = searchParams.get('zoneId') ?? undefined
    const serverId = searchParams.get('serverId') ?? undefined
    const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '100', 10))

    let records: any[] = []

    if (withHistory) {
      records = getDnsRecordsWithHistory({ status, limit })
    } else {
      records = getDnsRecords({
        status,
        zoneId,
        serverId,
        userId: session.userId,
        limit,
      })
    }

    // Ensure records is always an array
    const safeRecords = Array.isArray(records) ? records : []

    return ok({ records: safeRecords, total: safeRecords.length })
  } catch (e) {
    console.error('[dns-records] Error:', e)
    // Return empty array on error instead of 500
    return ok({ records: [], total: 0 })
  }
}
