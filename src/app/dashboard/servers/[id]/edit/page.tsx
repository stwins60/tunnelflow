'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { EditServerForm } from '@/components/servers/edit-server-form'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { AppServer } from '@/types'

export default function EditServerPage({
  params,
}: {
  params: { id: string }
}) {
  const [server, setServer] = useState<AppServer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/servers/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setServer(d.data.server)
        else setError(d.error ?? 'Server not found')
      })
      .catch(() => setError('Failed to load server details'))
      .finally(() => setLoading(false))
  }, [params.id])

  return (
    <>
      <Header title="Edit Server" />
      <div className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/dashboard/servers" title="Back to Servers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="font-semibold text-lg">
              {loading ? 'Edit Server' : server ? `Edit ${server.name}` : 'Server Not Found'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Update server configuration, routing, and tunnel bindings.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingPage />
        ) : error || !server ? (
          <div className="space-y-4 max-w-lg">
            <Alert variant="destructive">
              <AlertDescription>{error ?? 'Server not found'}</AlertDescription>
            </Alert>
            <Button asChild variant="outline">
              <Link href="/dashboard/servers">Back to Servers</Link>
            </Button>
          </div>
        ) : (
          <EditServerForm server={server} />
        )}
      </div>
    </>
  )
}
