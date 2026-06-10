// ─── Event types ──────────────────────────────────────────────────────────────

export type NotificationEvent =
  | 'sync.drift_detected'   // One or more servers are out-of-sync with Cloudflare
  | 'sync.error'            // Sync run threw an unrecoverable error
  | 'sync.completed'        // Sync finished successfully (no drift)
  | 'server.provisioned'    // Server successfully provisioned
  | 'server.deprovisioned'  // Server deprovisioned / DNS record removed
  | 'server.error'          // Server provisioning/deprovisioning failed
  | 'server.down'           // Health check: upstream is unreachable
  | 'server.up'             // Health check: upstream recovered
  | 'tunnel.created'        // New tunnel detected from Cloudflare
  | 'tunnel.deleted'        // Tunnel removed from Cloudflare

export const ALL_EVENTS: NotificationEvent[] = [
  'sync.drift_detected',
  'sync.error',
  'sync.completed',
  'server.provisioned',
  'server.deprovisioned',
  'server.error',
  'server.down',
  'server.up',
  'tunnel.created',
  'tunnel.deleted',
]

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  'sync.drift_detected':  'Sync — Drift Detected',
  'sync.error':           'Sync — Error',
  'sync.completed':       'Sync — Completed',
  'server.provisioned':   'Server — Provisioned',
  'server.deprovisioned': 'Server — Deprovisioned',
  'server.error':         'Server — Error',
  'server.down':          'Server — Down (health check failed)',
  'server.up':            'Server — Up (health check recovered)',
  'tunnel.created':       'Tunnel — Created',
  'tunnel.deleted':       'Tunnel — Deleted',
}

// ─── Notification payload ─────────────────────────────────────────────────────

export interface NotificationPayload {
  event: NotificationEvent
  title: string
  body: string
  /** Optional extra key/value pairs shown in structured channels */
  fields?: Record<string, string>
}

// ─── Channel config shapes (pre-encryption) ───────────────────────────────────

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean       // true = TLS/SSL, false = STARTTLS or plain
  user: string
  /** AES-encrypted at rest */
  password: string
  from: string
  to: string
}

export interface SlackConfig {
  /** Incoming Webhook URL — AES-encrypted at rest */
  webhookUrl: string
  /** Optional channel override e.g. #alerts */
  channel?: string
  username?: string
}

export interface DiscordConfig {
  /** Webhook URL — AES-encrypted at rest */
  webhookUrl: string
  username?: string
}

export interface TelegramConfig {
  /** Bot token — AES-encrypted at rest */
  botToken: string
  chatId: string
}

export type ChannelConfig = SmtpConfig | SlackConfig | DiscordConfig | TelegramConfig

// ─── Decoded channel (config already decrypted) ───────────────────────────────

export interface NotificationChannel {
  id: string
  userId: string
  type: 'smtp' | 'slack' | 'discord' | 'telegram'
  name: string
  config: ChannelConfig
  enabled: boolean
  events: NotificationEvent[]
  lastTestedAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}
