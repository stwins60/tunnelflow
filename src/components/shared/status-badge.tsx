'use client'

import { Badge } from '@/components/ui/badge'
import { TunnelStatus, ServerStatus } from '@/types'

const tunnelStatusConfig: Record<TunnelStatus, { label: string; variant: 'success' | 'error' | 'warning' | 'secondary' }> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'secondary' },
  degraded: { label: 'Degraded', variant: 'warning' },
  error: { label: 'Error', variant: 'error' },
}

const serverStatusConfig: Record<ServerStatus, { label: string; variant: 'success' | 'error' | 'warning' | 'secondary' | 'info' }> = {
  active: { label: 'Active', variant: 'success' },
  pending: { label: 'Pending', variant: 'secondary' },
  error: { label: 'Error', variant: 'error' },
  deleting: { label: 'Deleting', variant: 'warning' },
}

export function TunnelStatusBadge({ status }: { status: TunnelStatus }) {
  const config = tunnelStatusConfig[status] ?? { label: status, variant: 'secondary' as const }
  return <Badge variant={config.variant as any}>{config.label}</Badge>
}

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const config = serverStatusConfig[status] ?? { label: status, variant: 'secondary' as const }
  return <Badge variant={config.variant as any}>{config.label}</Badge>
}
