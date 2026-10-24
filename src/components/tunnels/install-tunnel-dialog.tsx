'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CopyCode, CopyButton } from '@/components/shared/copy-button'
import {
  Boxes,
  Terminal,
  Play,
  Key,
  Layers,
  FileCode,
} from 'lucide-react'

export interface TokenCommands {
  docker: string
  systemd: string
  direct: string
  kubernetes: string
  kubernetesManifest?: string
  kubernetesSecret?: string
}

export interface TokenData {
  tunnelId: string
  tunnelName: string
  token: string
  commands: TokenCommands
}

interface InstallTunnelDialogProps {
  tunnelName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenData: TokenData | null
  loading?: boolean
}

export function InstallTunnelDialog({
  tunnelName,
  open,
  onOpenChange,
  tokenData,
  loading = false,
}: InstallTunnelDialogProps) {
  const [activeTab, setActiveTab] = useState('docker')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-lg">Install cloudflared — {tunnelName}</DialogTitle>
          </div>
          <DialogDescription>
            Choose your deployment target below to get the tailored installation commands and manifests.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Fetching secure install token from Cloudflare…
          </div>
        ) : tokenData ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="docker" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Layers className="h-3.5 w-3.5" />
                  Docker
                </TabsTrigger>
                <TabsTrigger value="systemd" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Terminal className="h-3.5 w-3.5" />
                  systemd
                </TabsTrigger>
                <TabsTrigger value="kubernetes" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Boxes className="h-3.5 w-3.5" />
                  Kubernetes
                </TabsTrigger>
                <TabsTrigger value="direct" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Play className="h-3.5 w-3.5" />
                  Direct Run
                </TabsTrigger>
              </TabsList>

              {/* ─── DOCKER TAB ────────────────────────────────────────── */}
              <TabsContent value="docker" className="space-y-3 pt-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Docker Container (Recommended)</span>
                    <Badge variant="outline" className="text-[10px]">Isolated Network</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Creates a dedicated network (<code className="font-mono text-primary">cloudflared-{tunnelName}</code>) and runs the official cloudflared container in detached mode.
                  </p>
                </div>
                <CopyCode label="Docker Run Command" code={tokenData.commands.docker} />
              </TabsContent>

              {/* ─── SYSTEMD TAB ───────────────────────────────────────── */}
              <TabsContent value="systemd" className="space-y-3 pt-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Linux System Service (systemd)</span>
                    <Badge variant="outline" className="text-[10px]">Auto-restart</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Downloads official binary, sets up <code className="font-mono text-primary">/etc/systemd/system/cloudflared-{tunnelName}.service</code> with automatic restart on failure, and starts it immediately.
                  </p>
                </div>
                <CopyCode label="systemd Service Setup (Run as root)" code={tokenData.commands.systemd} />
              </TabsContent>

              {/* ─── KUBERNETES TAB ────────────────────────────────────── */}
              <TabsContent value="kubernetes" className="space-y-3 pt-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Boxes className="h-4 w-4 text-primary" />
                      Production Kubernetes HA Deployment
                    </span>
                    <Badge variant="secondary" className="text-[10px]">2 Replicas · Probes · Non-Root</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Full HA deployment with 2 replicas, readiness &amp; liveness probes on port 2000, Prometheus metrics, and non-root security context.
                  </p>
                </div>

                <Tabs defaultValue="apply" className="w-full">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-medium text-muted-foreground">Format:</span>
                    <TabsList className="h-8">
                      <TabsTrigger value="apply" className="text-xs px-2.5 py-1">Quick Apply (All-in-One)</TabsTrigger>
                      <TabsTrigger value="manifest" className="text-xs px-2.5 py-1 flex items-center gap-1">
                        <FileCode className="h-3 w-3" />
                        deployment.yaml
                      </TabsTrigger>
                      <TabsTrigger value="secret" className="text-xs px-2.5 py-1">Secret Command</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="apply" className="space-y-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      Creates the <code className="font-mono text-primary">cloudflared</code> namespace, secret, and full deployment in a single command:
                    </p>
                    <CopyCode label="kubectl apply -f - (All-in-One)" code={tokenData.commands.kubernetes} />
                  </TabsContent>

                  <TabsContent value="manifest" className="space-y-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      Full production manifest. Save as <code className="font-mono text-primary font-medium">deployment.yaml</code> and apply with <code className="font-mono">kubectl apply -f deployment.yaml</code>:
                    </p>
                    <CopyCode label="deployment.yaml" code={tokenData.commands.kubernetesManifest || tokenData.commands.kubernetes} />
                  </TabsContent>

                  <TabsContent value="secret" className="space-y-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      Create the secret manually if managing deployments via GitOps or Helm:
                    </p>
                    <CopyCode label="Kubernetes Secret Command" code={tokenData.commands.kubernetesSecret || ''} />
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* ─── DIRECT RUN TAB ────────────────────────────────────── */}
              <TabsContent value="direct" className="space-y-3 pt-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Direct Run (Foreground)</span>
                    <Badge variant="outline" className="text-[10px]">Testing &amp; Debug</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Runs directly in your active terminal session. Useful for immediate verification and log inspection.
                  </p>
                </div>
                <CopyCode label="cloudflared Direct Run" code={tokenData.commands.direct} />
              </TabsContent>
            </Tabs>

            {/* Raw Token bar */}
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Tunnel Token:</span>
                <span className="font-mono truncate max-w-xs">{tokenData.token.slice(0, 16)}••••••••••••••••</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-muted-foreground">Copy token only:</span>
                <CopyButton text={tokenData.token} size="sm" className="h-6 px-2 text-xs" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              After running the install command, the tunnel status will automatically change to Active within a few seconds.
            </p>
          </div>
        ) : null}

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
