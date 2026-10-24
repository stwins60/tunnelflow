/**
 * GET /api/tunnels/[id]/token
 *
 * Returns the cloudflared install command for this tunnel.
 * The raw token is never stored in the DB — it's fetched from Cloudflare on demand.
 * Only admins can access this endpoint.
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { getCfCredentials } from '@/lib/cloudflare'
import { getTunnelToken } from '@/lib/cloudflare/tunnels'
import { ok, unauthorized, notFound, serverError, getClientIp } from '@/lib/api-helpers'
import { resolveWorkspaceId, audit } from '@/lib/auth'
import type { DbTunnel } from '@/lib/db'

interface Params {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    const tunnel = db.prepare(
      'SELECT * FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, wsId) as DbTunnel | undefined
    if (!tunnel) return notFound('Tunnel')

    const { token, accountId } = await getCfCredentials(wsId)
    const tunnelToken = await getTunnelToken(accountId, tunnel.cfTunnelId, token)

    await audit({
      action: 'VIEW_TUNNEL_TOKEN',
      resource: 'tunnel',
      resourceId: tunnel.id,
      details: { name: tunnel.name },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

    const k8sDeploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: cloudflared
  labels:
    app: cloudflared
spec:
  replicas: 2                     # two connectors = no outage if one pod restarts
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest   # pin a specific version in production
          args:
            - tunnel
            - --no-autoupdate                    # Kubernetes handles upgrades, not cloudflared
            - --loglevel
            - info
            - --metrics
            - 0.0.0.0:2000                       # /metrics and /ready for Prometheus + probes
            - run
          env:
            - name: TUNNEL_TOKEN                 # cloudflared reads the token from this variable
              valueFrom:
                secretKeyRef:
                  name: tunnel-token
                  key: token
          ports:
            - name: metrics
              containerPort: 2000
          readinessProbe:                        # 200 once connected to the Cloudflare edge
            httpGet:
              path: /ready
              port: metrics
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ready
              port: metrics
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 256Mi
          securityContext:
            runAsNonRoot: true
            runAsUser: 65532                     # the image's "nonroot" user, given as a number
            runAsGroup: 65532
            allowPrivilegeEscalation: false`

    const k8sQuickApply = `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Namespace
metadata:
  name: cloudflared
---
apiVersion: v1
kind: Secret
metadata:
  name: tunnel-token
  namespace: cloudflared
type: Opaque
stringData:
  token: ${tunnelToken}
---
${k8sDeploymentYaml}
EOF`

    const k8sSecretCmd = `kubectl create namespace cloudflared 2>/dev/null || true\nkubectl create secret generic tunnel-token \\\n  --from-literal=token=${tunnelToken} \\\n  -n cloudflared \\\n  --dry-run=client -o yaml | kubectl apply -f -`

    // Return install commands, not the raw token text (still sensitive — HTTPS only in prod)
    return ok({
      tunnelId: tunnel.cfTunnelId,
      tunnelName: tunnel.name,
      token: tunnelToken, // Used by the UI for the install command display
      commands: {
        docker: `docker network create cloudflared-${tunnel.name} 2>/dev/null || true\ndocker run -d \\
  --name cloudflared-${tunnel.name} \\
  --network cloudflared-${tunnel.name} \\
  cloudflare/cloudflared:latest \\
  tunnel --no-autoupdate run --token ${tunnelToken}`,
        systemd: `curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64\nchmod +x cloudflared\nsudo mv cloudflared /usr/local/bin/\nsudo tee /etc/systemd/system/cloudflared-${tunnel.name}.service > /dev/null <<'SERVICE'\n[Unit]\nDescription=cloudflared tunnel ${tunnel.name}\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token ${tunnelToken}\nRestart=on-failure\nRestartSec=5s\nUser=root\n\n[Install]\nWantedBy=multi-user.target\nSERVICE\nsudo systemctl daemon-reload\nsudo systemctl enable --now cloudflared-${tunnel.name}.service`,
        direct: `cloudflared tunnel run --token ${tunnelToken}`,
        kubernetes: k8sQuickApply,
        kubernetesManifest: k8sDeploymentYaml,
        kubernetesSecret: k8sSecretCmd,
      },
    })
  } catch (e) {
    return serverError(e)
  }
}
