import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/guards'
import { resolveWorkspaceId } from '@/lib/auth'
import { createApiKey, listApiKeys, ALL_SCOPES, type ApiKeyScope } from '@/lib/apikey'
import { ok, err, unauthorized, forbidden, serverError } from '@/lib/api-helpers'
import { audit } from '@/lib/auth'
import { getClientIp } from '@/lib/api-helpers'

export async function GET() {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)
    const keys = listApiKeys(wsId)
    // Never expose keyHash in responses
    const safe = keys.map(({ keyHash: _kh, ...rest }) => rest)
    return ok({ apiKeys: safe })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    if (e instanceof Error && e.message.startsWith('Forbidden')) return forbidden()
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)
    const body = await req.json()
    const { name, scopes, expiresAt } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return err('name is required')
    }

    const validScopes = (scopes as unknown[])?.filter(
      (s): s is ApiKeyScope => ALL_SCOPES.includes(s as ApiKeyScope)
    ) ?? ['read']

    const { row, rawKey } = createApiKey({
      userId: wsId,
      name: name.trim(),
      scopes: validScopes.length ? validScopes : ['read'],
      expiresAt: expiresAt ?? null,
    })

    await audit({
      action: 'CREATE_API_KEY',
      resource: 'ApiKey',
      resourceId: row.id,
      details: { name: row.name, scopes: JSON.parse(row.scopes) },
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    const { keyHash: _kh, ...safe } = row
    // rawKey is returned ONCE — client must store it
    return ok({ apiKey: safe, rawKey }, 201)
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    if (e instanceof Error && e.message.startsWith('Forbidden')) return forbidden()
    return serverError(e)
  }
}
