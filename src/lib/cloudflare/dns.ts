/**
 * Cloudflare DNS management service.
 *
 * Creates and manages CNAME records for tunnel subdomains.
 */

import { CfDnsRecord } from '@/types'
import { cfGet, cfPost, cfPut, cfDelete, CloudflareApiError } from './client'

export interface CreateDnsRecordParams {
  zoneId: string
  name: string      // subdomain, e.g. "app1" or "app1.example.com"
  tunnelId: string  // Cloudflare tunnel UUID
  ttl?: number      // 1 = auto
}

// ─── DNS Record CRUD ──────────────────────────────────────────────────────────

/**
 * Create a CNAME DNS record pointing to a Cloudflare Tunnel.
 * The record is proxied (orange-cloud) so traffic flows through CF.
 */
export async function createTunnelDnsRecord(
  params: CreateDnsRecordParams,
  token?: string
): Promise<CfDnsRecord> {
  const content = `${params.tunnelId}.cfargotunnel.com`

  return cfPost<CfDnsRecord>(
    `/zones/${params.zoneId}/dns_records`,
    {
      type: 'CNAME',
      name: params.name,
      content,
      proxied: true,
      ttl: params.ttl ?? 1,
      comment: 'Managed by Tunnel Manager',
    },
    token
  )
}

/**
 * Update an existing DNS record to point to a (possibly different) tunnel.
 */
export async function updateTunnelDnsRecord(
  zoneId: string,
  recordId: string,
  name: string,
  tunnelId: string,
  token?: string
): Promise<CfDnsRecord> {
  const content = `${tunnelId}.cfargotunnel.com`

  return cfPut<CfDnsRecord>(
    `/zones/${zoneId}/dns_records/${recordId}`,
    {
      type: 'CNAME',
      name,
      content,
      proxied: true,
      ttl: 1,
      comment: 'Managed by Tunnel Manager',
    },
    token
  )
}

/**
 * Delete a DNS record.
 */
export async function deleteDnsRecord(
  zoneId: string,
  recordId: string,
  token?: string
): Promise<void> {
  try {
    await cfDelete(`/zones/${zoneId}/dns_records/${recordId}`, undefined, token)
  } catch (err) {
    if (err instanceof CloudflareApiError && err.isNotFound) {
      // Already gone — ignore
      return
    }
    throw err
  }
}

/**
 * List all DNS records for a zone, optionally filtering by name.
 */
export async function listDnsRecords(
  zoneId: string,
  options?: { name?: string; type?: string },
  token?: string
): Promise<CfDnsRecord[]> {
  let url = `/zones/${zoneId}/dns_records?per_page=100`
  if (options?.name) url += `&name=${encodeURIComponent(options.name)}`
  if (options?.type) url += `&type=${encodeURIComponent(options.type)}`

  return cfGet<CfDnsRecord[]>(url, token)
}

/**
 * Look up a DNS record by exact name.
 * Returns null if not found.
 */
export async function findDnsRecord(
  zoneId: string,
  name: string,
  token?: string
): Promise<CfDnsRecord | null> {
  const records = await listDnsRecords(zoneId, { name }, token)
  return records.find((r) => r.name === name) ?? null
}

/**
 * Check whether a hostname already has a DNS record.
 * Returns conflict info if one exists.
 */
export async function checkDnsConflict(
  zoneId: string,
  hostname: string,
  token?: string
): Promise<{ hasConflict: boolean; existing?: CfDnsRecord }> {
  const existing = await findDnsRecord(zoneId, hostname, token)
  return {
    hasConflict: existing !== null,
    existing: existing ?? undefined,
  }
}
