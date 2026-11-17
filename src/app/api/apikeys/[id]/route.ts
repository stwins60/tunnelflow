import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/guards'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import { revokeApiKey } from '@/lib/apikey'
import { ok, unauthorized, forbidden, notFound, serverError, getClientIp } from '@/lib/api-helpers'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin()
    const wsId = resolveWorkspaceId(session.userId!)
    const revoked = revokeApiKey(params.id, wsId)
    if (!revoked) return notFound('API key')

    await audit({
      action: 'REVOKE_API_KEY',
      resource: 'ApiKey',
      resourceId: params.id,
      userId: session.userId,
      ipAddress: getClientIp(req),
    })

    return ok({ revoked: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized()
    if (e instanceof Error && e.message.startsWith('Forbidden')) return forbidden()
    return serverError(e)
  }
}
