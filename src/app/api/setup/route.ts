/**
 * POST /api/setup
 *
 * Configure or reconfigure Cloudflare credentials for the authenticated user.
 * Unlike the old single-tenant setup, this now requires authentication
 * and scopes all settings to the requesting user.
 *
 * GET /api/setup — returns whether the current user's setup is complete.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { hashPassword, setSetting, SETTING_KEYS, isSetupComplete, audit } from '@/lib/auth'
import { verifyToken, cfRequest, CloudflareApiError } from '@/lib/cloudflare/client'
import { getZone } from '@/lib/cloudflare/zones'
import { ok, err, serverError, getClientIp } from '@/lib/api-helpers'
import { getSession } from '@/lib/session'

const setupSchema = z.object({
  apiToken: z.string().min(1, 'API token is required'),
  accountId: z.string().min(1, 'Account ID is required'),
  zoneIds: z.array(z.string().min(1)).min(1, 'At least one zone is required'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return err('Authentication required.', 401)
    }

    const body = await request.json()
    const parsed = setupSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { apiToken, accountId, zoneIds } = parsed.data

    // 1. Verify the token is active
    const verification = await verifyToken(apiToken)
    if (!verification.valid) {
      return err('Cloudflare API token is invalid or inactive.', 422, 'INVALID_TOKEN')
    }

    // 2. Validate tunnel create permission on the selected account.
    // We intentionally send an invalid payload so Cloudflare validates auth
    // but does not create any resource.
    try {
      await cfRequest(
        `/accounts/${accountId}/cfd_tunnel`,
        { method: 'POST', body: JSON.stringify({}) },
        apiToken
      )
    } catch (e) {
      if (e instanceof CloudflareApiError) {
        if (e.isAuthError) {
          return err(
            'API token is missing required permission: Account > Cloudflare Tunnel > Edit.',
            422,
            'TUNNEL_PERMISSION_DENIED'
          )
        }
        if (e.isNotFound) {
          return err(
            `Account "${accountId}" was not found or is not accessible by this API token.`,
            422,
            'ACCOUNT_ACCESS_DENIED'
          )
        }
        // Non-auth errors here are expected (invalid payload) and prove the token
        // can reach the tunnel create endpoint.
      } else {
        throw e
      }
    }

    // 3. Validate each zone + DNS edit permission
    const zones: { id: string; name: string }[] = []
    for (const zoneId of zoneIds) {
      try {
        const zone = await getZone(zoneId, apiToken)

        // Probe DNS write permission using an invalid payload (no side effects).
        try {
          await cfRequest(
            `/zones/${zoneId}/dns_records`,
            { method: 'POST', body: JSON.stringify({}) },
            apiToken
          )
        } catch (probeErr) {
          if (probeErr instanceof CloudflareApiError && probeErr.isAuthError) {
            return err(
              `API token is missing required permission for zone "${zone.name}": Zone > DNS > Edit.`,
              422,
              'DNS_PERMISSION_DENIED'
            )
          }
          // Validation errors are expected for this probe when permissions are present.
        }

        zones.push({ id: zoneId, name: zone.name })
      } catch {
        return err(`API token does not have access to zone "${zoneId}".`, 422, 'ZONE_ACCESS_DENIED')
      }
    }

    // 4. Store credentials scoped to this user
    await setSetting(SETTING_KEYS.CF_API_TOKEN, apiToken, session.userId)
    await setSetting(SETTING_KEYS.CF_ACCOUNT_ID, accountId, session.userId)
    await setSetting(SETTING_KEYS.CF_ZONES, JSON.stringify(zones), session.userId)
    await setSetting(SETTING_KEYS.CF_ZONE_ID, zones[0].id, session.userId)
    await setSetting(SETTING_KEYS.CF_ZONE_NAME, zones[0].name, session.userId)
    await setSetting(SETTING_KEYS.SETUP_COMPLETE, 'true', session.userId)

    // 5. Audit
    await audit({
      action: 'SETUP_COMPLETE',
      resource: 'setting',
      details: { accountId, zones },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ message: 'Setup complete', zones }, 200)
  } catch (e) {
    return serverError(e)
  }
}

/**
 * GET /api/setup
 * Returns whether the current user's setup has been completed.
 * If not authenticated, returns { complete: false }.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return ok({ complete: false })
    }
    const complete = await isSetupComplete(session.userId)
    return ok({ complete })
  } catch (e) {
    return serverError(e)
  }
}
