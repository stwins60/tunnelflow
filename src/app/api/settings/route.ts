/**
 * GET  /api/settings        — get non-sensitive settings for the current user
 * POST /api/settings        — update settings (admin only)
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, requireAuth } from '@/lib/session'
import { getSetting, setSetting, SETTING_KEYS, getAllSettings, audit } from '@/lib/auth'
import { verifyToken } from '@/lib/cloudflare/client'
import { getZone } from '@/lib/cloudflare/zones'
import { ok, err, unauthorized, serverError, getClientIp } from '@/lib/api-helpers'

export async function GET() {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const settings = await getAllSettings(session.userId)

    // Parse CF_ZONES JSON array; fall back to legacy single-zone keys
    let cfZones: { id: string; name: string }[] | null = null
    if (settings[SETTING_KEYS.CF_ZONES]) {
      try {
        cfZones = JSON.parse(settings[SETTING_KEYS.CF_ZONES] as string)
      } catch { /* ignore */ }
    }
    if (!cfZones && settings[SETTING_KEYS.CF_ZONE_ID] && settings[SETTING_KEYS.CF_ZONE_NAME]) {
      cfZones = [{ id: settings[SETTING_KEYS.CF_ZONE_ID] as string, name: settings[SETTING_KEYS.CF_ZONE_NAME] as string }]
    }

    return ok({
      settings: {
        // Never expose the raw token — show a redacted indicator
        cfApiToken: settings[SETTING_KEYS.CF_API_TOKEN] ? '[CONFIGURED]' : null,
        cfAccountId: settings[SETTING_KEYS.CF_ACCOUNT_ID],
        cfZones: cfZones ?? [],
        setupComplete: settings[SETTING_KEYS.SETUP_COMPLETE] === 'true',
      },
    })
  } catch (e) {
    return serverError(e)
  }
}

const updateSchema = z.object({
  apiToken: z.string().min(1).optional(),
  zoneIds: z.array(z.string().min(1)).min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join('; '), 422)
    }

    const { apiToken, zoneIds } = parsed.data

    const tokenToUse = apiToken ?? (await getSetting(SETTING_KEYS.CF_API_TOKEN, session.userId))
    if (!tokenToUse) {
      return err('No API token available.', 422)
    }

    if (apiToken) {
      const v = await verifyToken(apiToken)
      if (!v.valid) {
        return err('New API token is invalid or inactive.', 422)
      }
      await setSetting(SETTING_KEYS.CF_API_TOKEN, apiToken, session.userId)
    }

    if (zoneIds) {
      const zones: { id: string; name: string }[] = []
      for (const zoneId of zoneIds) {
        try {
          const zone = await getZone(zoneId, tokenToUse)
          zones.push({ id: zoneId, name: zone.name })
        } catch {
          return err(`Token does not have access to zone "${zoneId}".`, 422)
        }
      }
      await setSetting(SETTING_KEYS.CF_ZONES, JSON.stringify(zones), session.userId)
      // Keep legacy keys updated to first zone
      await setSetting(SETTING_KEYS.CF_ZONE_ID, zones[0].id, session.userId)
      await setSetting(SETTING_KEYS.CF_ZONE_NAME, zones[0].name, session.userId)
    }

    await audit({
      action: 'UPDATE_SETTINGS',
      resource: 'setting',
      details: { updatedFields: Object.keys(parsed.data) },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    return ok({ message: 'Settings updated' })
  } catch (e) {
    return serverError(e)
  }
}
