/**
 * Cloudflare Zones service
 */

import { CfZone } from '@/types'
import { cfGet } from './client'

/**
 * List all zones accessible with the current API token.
 */
export async function listZones(token?: string): Promise<CfZone[]> {
  let page = 1
  const allZones: CfZone[] = []

  while (true) {
    const res = await cfGet<CfZone[]>(`/zones?per_page=50&page=${page}&status=active`, token)
    allZones.push(...(res ?? []))
    if (!res || res.length < 50) break
    page++
  }

  return allZones
}

/**
 * Get a single zone by ID.
 */
export async function getZone(zoneId: string, token?: string): Promise<CfZone> {
  return cfGet<CfZone>(`/zones/${zoneId}`, token)
}
