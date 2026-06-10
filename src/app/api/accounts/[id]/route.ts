import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { db, now, type DbCloudflareAccount } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { ok, err, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'

function safeRow(row: DbCloudflareAccount) {
  const { apiToken: _t, ...rest } = row
  return { ...rest, hasToken: true }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)
    const account = db
      .prepare('SELECT * FROM "CloudflareAccount" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbCloudflareAccount | undefined
    if (!account) return notFound('Account')
    return ok({ account: safeRow(account) })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)

    const existing = db
      .prepare('SELECT * FROM "CloudflareAccount" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbCloudflareAccount | undefined
    if (!existing) return notFound('Account')

    const body = await req.json()
    const { name, accountId, apiToken, isPrimary } = body

    if (isPrimary) {
      db.prepare('UPDATE "CloudflareAccount" SET "isPrimary" = 0 WHERE "userId" = ?').run(wsId)
    }

    const encryptedToken = apiToken ? encrypt(apiToken) : existing.apiToken

    db.prepare(`
      UPDATE "CloudflareAccount"
      SET "name" = ?, "accountId" = ?, "apiToken" = ?, "isPrimary" = ?, "updatedAt" = ?
      WHERE "id" = ?
    `).run(
      name ?? existing.name,
      accountId ?? existing.accountId,
      encryptedToken,
      isPrimary !== undefined ? (isPrimary ? 1 : 0) : existing.isPrimary,
      now(),
      params.id
    )

    const updated = db
      .prepare('SELECT * FROM "CloudflareAccount" WHERE "id" = ?')
      .get(params.id) as DbCloudflareAccount

    await audit({
      action: 'UPDATE_CF_ACCOUNT',
      resource: 'CloudflareAccount',
      resourceId: params.id,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ account: safeRow(updated) })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)

    const existing = db
      .prepare('SELECT * FROM "CloudflareAccount" WHERE "id" = ? AND "userId" = ?')
      .get(params.id, wsId) as DbCloudflareAccount | undefined
    if (!existing) return notFound('Account')

    db.prepare('DELETE FROM "CloudflareAccount" WHERE "id" = ?').run(params.id)

    await audit({
      action: 'DELETE_CF_ACCOUNT',
      resource: 'CloudflareAccount',
      resourceId: params.id,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ deleted: true })
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message.startsWith('Forbidden'))) return unauthorized()
    return serverError(e)
  }
}
