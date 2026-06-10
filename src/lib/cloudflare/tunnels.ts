/**
 * Cloudflare Tunnel management service.
 *
 * Handles tunnel CRUD, configuration (ingress rules), and token retrieval.
 */

import { CfTunnel, CfTunnelConfig, CfIngressRule } from '@/types'
import { cfGet, cfPost, cfPut, cfPatch, cfDelete } from './client'

// ─── Tunnel CRUD ──────────────────────────────────────────────────────────────

export interface CreateTunnelParams {
  accountId: string
  name: string
}

export interface CreateTunnelResult {
  tunnel: CfTunnel
  /** The tunnel secret (used to derive the connector token). Shown once — store it or use the token endpoint. */
  tunnelSecret: string
}

/**
 * Create a new Cloudflare Tunnel.
 * The `tunnel_secret` is returned only at creation time.
 */
export async function createTunnel(
  params: CreateTunnelParams,
  token?: string
): Promise<CreateTunnelResult> {
  const body = {
    name: params.name,
    tunnel_secret: generateTunnelSecret(),
    config_src: 'cloudflare',
  }

  const result = await cfPost<CfTunnel & { tunnel_secret?: string }>(
    `/accounts/${params.accountId}/cfd_tunnel`,
    body,
    token
  )

  const tunnelSecret = (result as any).tunnel_secret ?? ''
  // Strip tunnel_secret from returned object to avoid accidental logging
  const { tunnel_secret: _secret, ...tunnel } = result as any

  return { tunnel, tunnelSecret }
}

/**
 * List all tunnels for an account (excluding deleted ones).
 */
export async function listTunnels(accountId: string, token?: string): Promise<CfTunnel[]> {
  let page = 1
  const all: CfTunnel[] = []

  while (true) {
    const res = await cfGet<CfTunnel[]>(
      `/accounts/${accountId}/cfd_tunnel?is_deleted=false&per_page=50&page=${page}`,
      token
    )
    all.push(...(res ?? []))
    if (!res || res.length < 50) break
    page++
  }

  return all
}

/**
 * Get a single tunnel by its Cloudflare UUID.
 */
export async function getTunnel(accountId: string, tunnelId: string, token?: string): Promise<CfTunnel> {
  return cfGet<CfTunnel>(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`, token)
}

/**
 * Rename an existing tunnel.
 */
export async function renameTunnel(
  accountId: string,
  tunnelId: string,
  newName: string,
  token?: string
): Promise<CfTunnel> {
  return cfPatch<CfTunnel>(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
    { name: newName },
    token
  )
}

/**
 * Delete a tunnel (must have no active connections).
 * Pass `force: true` to also clean up any active connections first.
 */
export async function deleteTunnel(
  accountId: string,
  tunnelId: string,
  token?: string
): Promise<void> {
  // Clean up connections first
  try {
    await cfDelete(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/connections`, {}, token)
  } catch {
    // Ignore — may have no active connections
  }

  await cfDelete(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`, undefined, token)
}

// ─── Tunnel Token ─────────────────────────────────────────────────────────────

/**
 * Get the connector token for a tunnel.
 * This token is used with: cloudflared tunnel run --token <token>
 */
export async function getTunnelToken(
  accountId: string,
  tunnelId: string,
  token?: string
): Promise<string> {
  return cfGet<string>(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`, token)
}

// ─── Tunnel Configuration (Ingress Rules) ────────────────────────────────────

/**
 * Get the current ingress configuration for a tunnel.
 */
export async function getTunnelConfig(
  accountId: string,
  tunnelId: string,
  token?: string
): Promise<CfTunnelConfig> {
  return cfGet<CfTunnelConfig>(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    token
  )
}

/**
 * Replace the entire ingress configuration for a tunnel.
 * Always adds a catch-all rule at the end (required by Cloudflare).
 */
export async function setTunnelConfig(
  accountId: string,
  tunnelId: string,
  rules: CfIngressRule[],
  token?: string
): Promise<CfTunnelConfig> {
  // Ensure catch-all is present and last
  const normalizedRules = [
    ...rules.filter((r) => r.hostname),
    { service: 'http_status:404' },
  ]

  return cfPut<CfTunnelConfig>(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    { config: { ingress: normalizedRules } },
    token
  )
}

/**
 * Add or update a single hostname route in the tunnel's ingress config.
 * Preserves existing routes, replacing any with the same hostname.
 */
export async function upsertTunnelRoute(
  accountId: string,
  tunnelId: string,
  hostname: string,
  service: string,
  originRequest?: CfIngressRule['originRequest'],
  token?: string
): Promise<CfTunnelConfig> {
  // Fetch current config
  let existingRules: CfIngressRule[] = []
  try {
    const current = await getTunnelConfig(accountId, tunnelId, token)
    existingRules = (current.config?.ingress ?? []).filter(
      (r) => r.hostname && r.hostname !== hostname && r.service !== 'http_status:404'
    )
  } catch {
    // No existing config yet
  }

  const newRule: CfIngressRule = { hostname, service, ...(originRequest ? { originRequest } : {}) }
  const allRules = [...existingRules, newRule]

  return setTunnelConfig(accountId, tunnelId, allRules, token)
}

/**
 * Remove a hostname route from the tunnel's ingress config.
 */
export async function removeTunnelRoute(
  accountId: string,
  tunnelId: string,
  hostname: string,
  token?: string
): Promise<CfTunnelConfig> {
  let existingRules: CfIngressRule[] = []
  try {
    const current = await getTunnelConfig(accountId, tunnelId, token)
    existingRules = (current.config?.ingress ?? []).filter(
      (r) => r.hostname && r.hostname !== hostname && r.service !== 'http_status:404'
    )
  } catch {
    // No existing config
  }

  return setTunnelConfig(accountId, tunnelId, existingRules, token)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTunnelSecret(): string {
  // 32 bytes of random data, base64 encoded
  const { randomBytes } = require('crypto')
  return randomBytes(32).toString('base64')
}

/**
 * Map Cloudflare tunnel status to our simplified status string.
 * The list API sets tunnel.status directly ('healthy' | 'degraded' | 'inactive' | 'error').
 * Fall back to counting connections if the status field is absent.
 */
export function normalizeTunnelStatus(
  tunnel: CfTunnel
): 'inactive' | 'active' | 'degraded' | 'error' {
  if (tunnel.deleted_at) return 'error'

  // Use Cloudflare's own tunnel status field when present
  const cfStatus = tunnel.status?.toLowerCase()
  if (cfStatus === 'healthy') return 'active'
  if (cfStatus === 'degraded') return 'degraded'
  if (cfStatus === 'inactive') return 'inactive'
  if (cfStatus === 'error') return 'error'

  // Fallback: count connections (for older API responses that include them)
  const activeConnections = tunnel.connections?.filter(
    (c) => c.status === 'connected' || c.status === 'active'
  ) ?? []
  if (activeConnections.length === 0) return 'inactive'
  return 'active'
}
