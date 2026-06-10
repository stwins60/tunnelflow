/**
 * GET /api/audit
 * Returns recent audit log entries (admin only, paginated).
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import type { DbAuditLogWithUser } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
    const offset = (page - 1) * limit

    const rawLogs = db.prepare(`
      SELECT
        a.*,
        u.email AS userEmail
      FROM "AuditLog" a
      LEFT JOIN "User" u ON u.id = a.userId
      WHERE a.userId = ?
      ORDER BY a.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(session.userId, limit, offset) as (Record<string, unknown>)[]

    const total = (db.prepare('SELECT COUNT(*) AS count FROM "AuditLog" WHERE "userId" = ?').get(session.userId) as { count: number }).count

    const logs: DbAuditLogWithUser[] = rawLogs.map((r) => ({
      id: r.id as string,
      action: r.action as string,
      resource: r.resource as string,
      resourceId: r.resourceId as string | null,
      details: r.details as string | null,
      before: r.before as string | null,
      after: r.after as string | null,
      userId: r.userId as string | null,
      ipAddress: r.ipAddress as string | null,
      createdAt: r.createdAt as string,
      user: r.userEmail ? { email: r.userEmail as string } : null,
    }))

    return ok({ logs, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (e) {
    return serverError(e)
  }
}
