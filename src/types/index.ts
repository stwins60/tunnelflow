// ─── Cloudflare API Types ─────────────────────────────────────────────────────

export interface CfTunnel {
  id: string
  name: string
  created_at: string
  deleted_at: string | null
  status: string
  connections: CfTunnelConnection[]
  metadata?: Record<string, unknown>
}

export interface CfTunnelConnection {
  id: string
  client_id: string
  client_version: string
  status: string
  origin_ip: string
  opened_at: string
  location: string
}

export interface CfTunnelConfig {
  tunnel_id: string
  version: number
  config: {
    ingress: CfIngressRule[]
  }
  source: string
  created_at: string
}

export interface CfIngressRule {
  hostname?: string
  service: string
  originRequest?: {
    noTLSVerify?: boolean
    connectTimeout?: number
    httpHostHeader?: string
    originServerName?: string
  }
}

export interface CfDnsRecord {
  id: string
  type: string
  name: string
  content: string
  proxied: boolean
  created_on: string
  modified_on: string
  ttl: number
  zone_id: string
  zone_name: string
}

export interface CfZone {
  id: string
  name: string
  status: string
  plan: { name: string }
  account: { id: string; name: string }
}

export interface CfAccount {
  id: string
  name: string
  type: string
}

export interface CfApiResponse<T> {
  success: boolean
  errors: CfApiError[]
  messages: CfApiMessage[]
  result: T
  result_info?: {
    page: number
    per_page: number
    total_count: number
    count: number
    total_pages: number
  }
}

export interface CfApiError {
  code: number
  message: string
}

export interface CfApiMessage {
  code: number
  message: string
}

// ─── App Types ────────────────────────────────────────────────────────────────

export interface AppTunnel {
  id: string
  cfTunnelId: string
  name: string
  accountId: string
  status: 'inactive' | 'active' | 'degraded' | 'error'
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
  servers?: AppServer[]
  // Live data from Cloudflare (populated during sync)
  connections?: CfTunnelConnection[]
}

export interface AppServer {
  id: string
  name: string
  subdomain: string
  upstream: string
  protocol: string
  tunnelId: string | null
  tunnel?: Pick<AppTunnel, 'id' | 'name' | 'cfTunnelId'>
  dnsRecordId: string | null
  status: 'pending' | 'active' | 'error' | 'deleting'
  notes: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export type TunnelStatus = AppTunnel['status']
export type ServerStatus = AppServer['status']

// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
  code?: string
  details?: unknown
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ─── Setup / Wizard ───────────────────────────────────────────────────────────

export interface SetupStep {
  id: number
  title: string
  description: string
  completed: boolean
}

export interface CloudflareCredentials {
  apiToken: string
  accountId: string
  zoneId: string
  zoneName: string
}

// ─── Conflict ────────────────────────────────────────────────────────────────

export interface HostnameConflict {
  hostname: string
  existingDnsRecord?: CfDnsRecord
  existingServer?: AppServer
}
