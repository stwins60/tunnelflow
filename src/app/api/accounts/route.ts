import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, newId, type DbCloudflareAccount } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'

function safeRow(row: DbCloudflareAccount) {
  // Never expose raw API token
  const { apiToken: _t, ...rest } = row
  return { ...rest, hasToken: true }
}

export async function GET() {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)
    const accounts = db
      .prepare('SELECT * FROM "CloudflareAccount" WHERE "userId" = ? ORDER BY "isPrimary" DESC, "name" ASC')
      .all(wsId) as DbCloudflareAccount[]
    return ok({ accounts: accounts.map(safeRow) })
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
    const { name, accountId, apiToken, isPrimary } = body

    if (!name || !accountId || !apiToken) {
      return err('name, accountId, and apiToken are required')
    }

    // If marking as primary, clear existing primary flag
    if (isPrimary) {
      db.prepare('UPDATE "CloudflareAccount" SET "isPrimary" = 0 WHERE "userId" = ?').run(wsId)
    }

    const id = newId()
    const ts = now()
    db.prepare(`
      INSERT INTO "CloudflareAccount" ("id", "userId", "name", "accountId", "apiToken", "isPrimary", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, wsId, name, accountId, encrypt(apiToken), isPrimary ? 1 : 0, ts, ts)

    const account = db.prepare('SELECT * FROM "CloudflareAccount" WHERE "id" = ?').get(id) as DbCloudflareAccount

    await audit({
      action: 'CREATE_CF_ACCOUNT',
      resource: 'CloudflareAccount',
      resourceId: id,
      details: { name, accountId },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ account: safeRow(account) }, 201)
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}
