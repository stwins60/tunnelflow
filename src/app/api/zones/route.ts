/**
 * GET /api/zones
 * Returns zones available with the current user's Cloudflare credentials.
 * Used during setup to let the user pick a zone.
 *
 * Query param: ?token=<api_token>
 * During setup the token isn't in the DB yet, so it can be passed directly.
 */

import { NextRequest } from 'next/server'
import { listZones } from '@/lib/cloudflare/zones'
import { getCfCredentials } from '@/lib/cloudflare'
import { ok, serverError } from '@/lib/api-helpers'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryToken = searchParams.get('token')

    // During setup/register, token is passed as a query param
    if (queryToken) {
      const zones = await listZones(queryToken)
      return ok({
        zones: zones.map((z) => ({
          id: z.id,
          name: z.name,
          status: z.status,
          accountId: z.account.id,
          accountName: z.account.name,
        })),
      })
    }

    // Normal authenticated request — use stored credentials
    const session = await getSession()
    if (!session.isLoggedIn) {
      return ok({ zones: [] })
    }

    const { token, zoneId, zoneName } = await getCfCredentials(session.userId)
    const zones = await listZones(token)
    return ok({
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        accountId: z.account.id,
        accountName: z.account.name,
        current: z.id === zoneId,
      })),
      currentZone: { id: zoneId, name: zoneName },
    })
  } catch (e) {
    return serverError(e)
  }
}
