/**
 * DNS Records Dashboard
 * Provides CNAME visibility and audit trail for all DNS records.
 */

import { DnsRecordsTable } from '@/components/dns/dns-records-table'

export const metadata = {
  title: 'DNS Records | Tunnel Manager',
  description: 'Track CNAME creation and deletion across all zones',
}

export default function DnsRecordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">DNS Records</h1>
        <p className="text-muted-foreground mt-2">
          Track all CNAME records created and deleted across your Cloudflare zones
        </p>
      </div>

      <DnsRecordsTable showDeleted={true} />
    </div>
  )
}
