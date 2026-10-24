/**
 * GET /api/dns-records
 * Returns DNS records with audit history (admin only, paginated).
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import { getDnsRecords, getDnsRecordsWithHistory, countDnsRecords, getDnsStats } from '@/lib/dns-audit'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') ?? 'all') as 'active' | 'deleted' | 'proxied' | 'all'
    const withHistory = searchParams.get('withHistory') === 'true'
    const zoneId = searchParams.get('zoneId') ?? undefined
    const serverId = searchParams.get('serverId') ?? undefined
    const search = searchParams.get('q') ?? searchParams.get('search') ?? undefined
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25', 10))
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const offset = (page - 1) * limit

    const total = countDnsRecords({ status, zoneId, serverId, userId: wsId, search })

    let records: any[] = []

    if (withHistory) {
      records = getDnsRecordsWithHistory({ status, zoneId, serverId, search, limit, offset, userId: wsId })
    } else {
      records = getDnsRecords({
        status,
        zoneId,
        serverId,
        userId: wsId,
        search,
        limit,
        offset,
      })
    }

    const safeRecords = Array.isArray(records) ? records : []
    const stats = getDnsStats(wsId)

    return ok({
      records: safeRecords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats,
    })
  } catch (e) {
    console.error('[dns-records] Error:', e)
    return ok({
      records: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
      stats: { total: 0, active: 0, deleted: 0, proxied: 0, zones: [] },
    })
  }
}
