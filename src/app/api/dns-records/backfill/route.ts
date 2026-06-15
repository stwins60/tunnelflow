/**
 * POST /api/dns-records/backfill
 * One-time migration to import existing DNS records into tracking system.
 * Admin only.
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import { backfillDnsRecords } from '@/lib/dns-backfill'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    console.log('[backfill] Starting DNS record backfill for workspace:', wsId)
    const results = await backfillDnsRecords(wsId)

    return ok({
      message: 'Backfill complete',
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors,
    })
  } catch (e) {
    console.error('[backfill] API error:', e)
    return serverError(e)
  }
}
