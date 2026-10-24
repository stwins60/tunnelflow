/**
 * DNS Records Dashboard
 * Provides CNAME visibility and audit trail for all DNS records.
 */

import { Header } from '@/components/layout/header'
import { DnsRecordsTable } from '@/components/dns/dns-records-table'

export const metadata = {
  title: 'DNS Records | TunnelFlow',
  description: 'Track CNAME creation, proxy status, and audit trail across all Cloudflare zones',
}

export default function DnsRecordsPage() {
  return (
    <>
      <Header title="DNS Records" />
      <div className="p-6 space-y-6">
        <DnsRecordsTable showDeleted={true} />
      </div>
    </>
  )
}
