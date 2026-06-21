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
import { audit } from '@/lib/auth'
import type { DbTunnel } from '@/lib/db'

interface Params {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session) return unauthorized()

    const tunnel = db.prepare(
      'SELECT * FROM "Tunnel" WHERE "id" = ? AND ("userId" = ? OR "userId" IS NULL)'
    ).get(params.id, session.userId) as DbTunnel | undefined
    if (!tunnel) return notFound('Tunnel')

    const { token, accountId } = await getCfCredentials(session.userId)
    const tunnelToken = await getTunnelToken(accountId, tunnel.cfTunnelId, token)

    await audit({
      action: 'VIEW_TUNNEL_TOKEN',
      resource: 'tunnel',
      resourceId: tunnel.id,
      details: { name: tunnel.name },
      userId: session.userId,
      ipAddress: getClientIp(request),
    })

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
          kubernetes: `kubectl create namespace cloudflared-${tunnel.name} 2>/dev/null || true\nkubectl create secret generic cloudflared-token --from-literal=TUNNEL_TOKEN=${tunnelToken} -n cloudflared-${tunnel.name}\nkubectl create deployment cloudflared \\
  --image=cloudflare/cloudflared:latest \\
  -n cloudflared-${tunnel.name} \\
        -- tunnel --no-autoupdate run\nkubectl set env deployment/cloudflared --from=secret/cloudflared-token -n cloudflared-${tunnel.name}`,
      },
    })
  } catch (e) {
    return serverError(e)
  }
}
