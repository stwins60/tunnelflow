import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { AddServerForm } from '@/components/servers/add-server-form'
import { LoadingPage } from '@/components/shared/loading-spinner'

export default function NewServerPage({
  searchParams,
}: {
  searchParams: { tunnelId?: string }
}) {
  return (
    <>
      <Header title="Add Server" />
      <div className="p-6">
        <div className="mb-5">
          <h2 className="font-semibold text-lg">Add New Server</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Assign a public hostname to a local service through a Cloudflare Tunnel.
            The DNS record and tunnel route will be created automatically.
          </p>
        </div>
        <Suspense fallback={<LoadingPage />}>
          <AddServerForm defaultTunnelId={searchParams.tunnelId} />
        </Suspense>
      </div>
    </>
  )
}
