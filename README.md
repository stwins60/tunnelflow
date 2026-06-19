# TunnelFlow

**Self-hosted Cloudflare Tunnel management platform** — provision routes, manage users, monitor health, and automate deployments from a clean SaaS-quality UI.

[![CI](https://github.com/stwins60/tunnelflow/actions/workflows/ci.yml/badge.svg)](https://github.com/stwins60/tunnelflow/actions/workflows/ci.yml)
[![Release](https://github.com/stwins60/tunnelflow/actions/workflows/release.yml/badge.svg)](https://github.com/stwins60/tunnelflow/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/stwins60/tunnelflow?sort=semver&label=release)](https://github.com/stwins60/tunnelflow/releases/latest)
[![GitHub Stars](https://img.shields.io/github/stars/stwins60/tunnelflow?style=flat)](https://github.com/stwins60/tunnelflow/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/stwins60/tunnelflow?style=flat)](https://github.com/stwins60/tunnelflow/forks)
[![Issues](https://img.shields.io/github/issues/stwins60/tunnelflow)](https://github.com/stwins60/tunnelflow/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-contributor%20covenant-purple.svg)](CODE_OF_CONDUCT.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)

---

## Features

| Category | Capability |
|---|---|
| **Tunnels** | Create, rename, delete CF tunnels; one-click install tokens (Docker/systemd/direct) |
| **Servers / Routes** | Provision hostnames end-to-end: tunnel ingress + CNAME DNS in one click |
| **Multi-account** | Store credentials for multiple Cloudflare accounts; set a primary |
| **Multi-user** | Invite members via token; ADMIN / EDITOR / VIEWER access levels; groups |
| **API Keys** | Scoped Bearer tokens (`read` / `write` / `deploy` / `admin`) for CI/CD automation |
| **Deployment API** | `POST /api/deploy` + `DELETE /api/deploy` — provision/deprovision from pipelines |
| **Health Monitoring** | HTTP polling per server; Up/Down state transitions; response-time badges |
| **Maintenance Windows** | Per-server scheduled windows; suppresses false-positive health alerts |
| **Notifications** | SMTP, Slack, Discord, Telegram — per-event, per-channel, AES-256-GCM encrypted |
| **Route Templates** | Reusable presets (protocol, upstream pattern, notes) for fast server creation |
| **Config-as-Code** | Export/import full workspace config as YAML with dry-run diff before applying |
| **Audit Log** | Every action logged with actor, IP, before/after diff; paginated |
| **Background Sync** | Drift detection between DB and Cloudflare; fires notifications |
| **Security** | AES-256-GCM encrypted secrets; rate limiting; security headers; httpOnly session cookies |

---

## Quick Start

### Option A — Docker Compose (recommended)

```bash
git clone https://github.com/stwins60/tunnelflow.git
cd tunnelflow

# Generate secrets
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env
echo "DATABASE_URL=file:/data/tunnel-manager.db" >> .env

docker compose up -d
```

Open **http://localhost:3000** and follow the setup wizard.

### Option B — Docker (single container)

```bash
docker run -d \
  --name tunnelflow \
  -p 3000:3000 \
  -v tunnelflow-data:/data \
  -e DATABASE_URL="file:/data/tunnel-manager.db" \
  -e ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  ghcr.io/stwins60/tunnelflow:latest
```

### Option C — Node.js (bare-metal)

```bash
git clone https://github.com/stwins60/tunnelflow.git
cd tunnelflow
npm install
cp .env.example .env   # then edit .env with your secrets
npm run build
npm start
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | SQLite path, e.g. `file:/data/tunnel-manager.db` |
| `ENCRYPTION_KEY` | Yes | — | 32+ hex chars — AES-256-GCM key for secrets at rest |
| `SESSION_SECRET` | Yes | — | 32+ chars — iron-session cookie signing key |
| `PORT` | No | `3000` | HTTP listen port |
| `NODE_ENV` | No | `development` | Set to `production` in prod |
| `SYNC_INTERVAL_MS` | No | `60000` | Background Cloudflare sync interval (ms) |
| `CF_MAX_RETRIES` | No | `3` | Max Cloudflare API retry attempts |
| `CF_RETRY_BASE_DELAY_MS` | No | `500` | Base delay for exponential backoff (ms) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window duration (ms) |
| `RATE_LIMIT_MAX_AUTH` | No | `10` | Max auth attempts per window (per IP) |
| `RATE_LIMIT_MAX_API` | No | `120` | Max API requests per window (per IP) |

Generate strong secrets:
```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -base64 32  # SESSION_SECRET
```

---

## Cloudflare API Token Setup

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → **Custom Token**
3. Add permissions:
   - `Account > Cloudflare Tunnel > Edit`
   - `Zone > DNS > Edit` (select your target zone(s))
4. Copy the token — you'll paste it in the setup wizard

---

## First-Time Setup Wizard

1. Visit `http://your-host:3000`
2. **Step 1** — Create the admin account (email + password)
3. **Step 2** — Paste your Cloudflare API token; the app validates it and fetches zones
4. **Step 3** — Select which zone(s) TunnelFlow should manage
5. Click **Finish Setup** → dashboard

---

## User Management

### Access Levels

| Level | Capabilities |
|---|---|
| `ADMIN` | Full access — settings, users, invitations, all resources |
| `EDITOR` | Create/manage tunnels and servers, run sync, use notifications and templates |
| `VIEWER` | Read-only access to all resources |

### Inviting Users

```
Dashboard → Users & Access → Invitations → Invite Member
```

1. Enter the invitee's email and choose their access level
2. An invite token is generated — send them the link
3. They register at `/invite?token=<token>`

### Groups

Groups give you a way to manage access for teams:
- Create a group with a default access level
- Add members; individual members can have a per-member override
- Effective access = max(individual level, group level)

---

## API Keys

API keys allow programmatic access without a session cookie. They're ideal for CI/CD pipelines.

### Scopes

| Scope | Allows |
|---|---|
| `read` | List tunnels, servers, templates |
| `write` | Create / update tunnels, servers, templates |
| `deploy` | Provision / deprovision servers via `/api/deploy` |
| `admin` | All of the above |

### Creating a key

```
Dashboard → API Keys → New Key
```

The raw key is shown **once** — copy it immediately. Only the SHA-256 hash is stored.

### Using a key

```bash
# Provision a server
curl -X POST https://your-host/api/deploy \
  -H "Authorization: Bearer tfk_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{"serverId": "<server-uuid>"}'

# Deprovision a server
curl -X DELETE https://your-host/api/deploy \
  -H "Authorization: Bearer tfk_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{"serverId": "<server-uuid>"}'
```

---

## Health Monitoring

TunnelFlow polls each active server's upstream URL (HTTP HEAD) automatically after every sync and on demand.

- **Up** — 1xx–4xx response received
- **Down** — 5xx or connection refused
- **Timeout** — no response within 10 seconds
- **Error** — network-level error

State transitions (`down → up`, `up → down`) fire `server.down` / `server.up` notifications.

### Manual health check

```bash
curl -X POST https://your-host/api/health-check \
  -H "Cookie: tm_session=<session>"
```

Or use the **Run Health Check** button on the dashboard overview.

### Maintenance Windows

Maintenance windows suppress health-check alerts for a server during a scheduled window.

```
Dashboard → Servers → [server detail] → Maintenance → Add Window
```

---

## Notifications

### Supported channels

| Type | Config fields |
|---|---|
| SMTP email | Host, port, TLS, user, password, from, to |
| Slack | Incoming Webhook URL, channel override, username |
| Discord | Webhook URL, username |
| Telegram | Bot token, chat ID |

All sensitive fields (passwords, tokens, webhook URLs) are AES-256-GCM encrypted at rest.

### Events

| Event | Fires when… |
|---|---|
| `sync.drift_detected` | Sync found servers out-of-sync with Cloudflare |
| `sync.completed` | Sync finished — everything in sync |
| `sync.error` | Sync threw an unrecoverable error |
| `server.provisioned` | Server successfully provisioned |
| `server.deprovisioned` | Server deprovisioned |
| `server.error` | Provisioning / deprovisioning failed |
| `server.down` | Upstream became unreachable (health check) |
| `server.up` | Upstream recovered (health check) |
| `tunnel.created` | New tunnel detected from Cloudflare |
| `tunnel.deleted` | Tunnel removed from Cloudflare |

---

## Config-as-Code (YAML)

### Export

```bash
# Download full workspace config as YAML
curl -s https://your-host/api/config \
  -H "Cookie: tm_session=<session>" \
  -o tunnelflow-config.yaml
```

The resulting file looks like:

```yaml
version: 1
tunnels:
  - name: my-tunnel
    cfTunnelId: abc123...
    accountId: def456...
servers:
  - name: My App
    subdomain: app.example.com
    upstream: http://localhost:8080
    protocol: http
    tunnel: my-tunnel
```

### Import (dry run)

```bash
# Preview the diff — nothing is written
curl -X POST https://your-host/api/config \
  -H "Cookie: tm_session=<session>" \
  -H "Content-Type: application/json" \
  -d "{\"yamlContent\": $(cat tunnelflow-config.yaml | jq -Rs .), \"apply\": false}"
```

### Import (apply)

```bash
# Apply the config
curl -X POST https://your-host/api/config \
  -H "Cookie: tm_session=<session>" \
  -H "Content-Type: application/json" \
  -d "{\"yamlContent\": $(cat tunnelflow-config.yaml | jq -Rs .), \"apply\": true}"
```

---

## CI/CD Integration Example

```yaml
# .github/workflows/deploy.yml
name: Deploy to TunnelFlow
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Provision server
        run: |
          curl -X POST ${{ vars.TUNNELFLOW_URL }}/api/deploy \
            -H "Authorization: Bearer ${{ secrets.TUNNELFLOW_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"serverId": "${{ vars.SERVER_ID }}"}'
```

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── accounts/           # Multi-CF-account CRUD
│   │   ├── apikeys/            # API key management
│   │   ├── audit/              # Audit log (paginated)
│   │   ├── auth/               # Login / logout / register / me
│   │   ├── config/             # YAML export + import
│   │   ├── deploy/             # Bearer-auth deployment API
│   │   ├── health/             # App health check
│   │   ├── health-check/       # Run upstream health checks
│   │   ├── invite/             # Invite token lookup (public)
│   │   ├── notifications/      # Channel CRUD + test
│   │   ├── servers/            # Server CRUD + provision + health + maintenance
│   │   ├── settings/           # Workspace settings
│   │   ├── setup/              # First-run wizard
│   │   ├── sync/               # Trigger / status sync
│   │   ├── templates/          # Route template CRUD
│   │   ├── tunnels/            # Tunnel CRUD + install token
│   │   ├── users/              # User / group / invitation management
│   │   └── zones/              # Cloudflare zone listing
│   └── dashboard/
│       ├── api-keys/           # API key management UI
│       ├── audit/              # Audit log with diff view
│       ├── notifications/      # Notification channel UI
│       ├── servers/            # Server list + new server form
│       ├── settings/           # App settings + multi-account
│       ├── templates/          # Route template UI
│       ├── tunnels/            # Tunnel list + detail
│       └── users/              # Members / groups / invitations
├── components/
│   ├── ui/                     # Radix UI + Tailwind primitives
│   ├── layout/                 # Sidebar, Header
│   ├── servers/                # ServerCard (health badge, maintenance)
│   └── shared/                 # Status badges, spinner, copy button
├── lib/
│   ├── apikey.ts               # API key generation, hash, scope validation
│   ├── auth.ts                 # Settings, access levels, workspace resolution, audit()
│   ├── cloudflare/             # CF API client (retry, backoff, zones, tunnels, DNS)
│   ├── crypto.ts               # AES-256-GCM encrypt / decrypt
│   ├── db.ts                   # SQLite singleton + schema + migrations
│   ├── health-checker.ts       # HTTP polling, state transitions, maintenance windows
│   ├── notifications/          # Dispatcher + SMTP / Slack / Discord / Telegram
│   ├── rate-limit.ts           # In-memory sliding-window rate limiter
│   ├── request-logger.ts       # Structured request/response logging
│   ├── session.ts              # iron-session helpers (requireAuth/Admin/Editor)
│   └── sync-state.ts           # Per-user in-memory sync state
├── middleware.ts               # Auth redirect + security headers + rate limiting
└── types/index.ts              # Shared TypeScript interfaces
```

---

## Security

- **Secrets at rest**: Cloudflare API tokens, webhook URLs, SMTP passwords — all AES-256-GCM encrypted with your `ENCRYPTION_KEY` before being stored in SQLite
- **Sessions**: `httpOnly`, `SameSite=strict`, 7-day TTL iron-session cookies
- **Rate limiting**: Configurable per-IP sliding-window limits on auth endpoints (default 10 req/min) and API endpoints (default 120 req/min)
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (when HTTPS)
- **Audit log**: Every action recorded with actor email, IP, timestamp, and before/after diff — secrets are never logged
- **API keys**: SHA-256 hash storage only — raw key shown once at creation; scoped to `read/write/deploy/admin`
- **Access control**: ADMIN > EDITOR > VIEWER enforced on every route handler; group membership is additive

### Reporting Vulnerabilities

See [SECURITY.md](SECURITY.md).

---

## Deployment

### Behind a reverse proxy (Nginx / Caddy)

TunnelFlow trusts `X-Forwarded-For` for IP logging. When behind a proxy, ensure the proxy sets this header correctly.

**Nginx example:**
```nginx
location / {
    proxy_pass         http://localhost:3000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

**Caddy example:**
```
your-domain.com {
    reverse_proxy localhost:3000
}
```

### Kubernetes (Helm-compatible manifest)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tunnelflow
spec:
  replicas: 1
  selector:
    matchLabels: { app: tunnelflow }
  template:
    metadata:
      labels: { app: tunnelflow }
    spec:
      containers:
        - name: tunnelflow
          image: ghcr.io/stwins60/tunnelflow:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              value: "file:/data/tunnel-manager.db"
            - name: ENCRYPTION_KEY
              valueFrom:
                secretKeyRef: { name: tunnelflow-secrets, key: encryption-key }
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef: { name: tunnelflow-secrets, key: session-secret }
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: tunnelflow-data
```

### Installing `cloudflared` on Kubernetes

Run `cloudflared` as a Deployment inside your cluster so it connects your Cloudflare Tunnel to in-cluster services.

**1. Get the tunnel token**

From the TunnelFlow dashboard go to **Tunnels → [your tunnel] → Install Token** and copy the token, or fetch it via the API:

```bash
curl -s https://your-host/api/tunnels/<tunnel-id>/install-token \
  -H "Authorization: Bearer tfk_<your-key>"
```

**2. Store the token as a Kubernetes Secret**

```bash
kubectl create secret generic cloudflared-token \
  --from-literal=token=<paste-tunnel-token-here>
```

**3. Deploy `cloudflared`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  labels:
    app: cloudflared
spec:
  replicas: 2          # run two replicas for high availability
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
          image: cloudflare/cloudflared:latest
          args:
            - tunnel
            - --no-autoupdate
            - run
            - --token
            - $(TUNNEL_TOKEN)
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cloudflared-token
                  key: token
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /ready
              port: 2000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 2000
            initialDelaySeconds: 5
            periodSeconds: 5
```

Apply it:

```bash
kubectl apply -f cloudflared-deployment.yaml
```

**4. Verify the connection**

```bash
kubectl get pods -l app=cloudflared
kubectl logs -l app=cloudflared --tail=50
```

You should see `Connected to Cloudflare` in the logs. The tunnel will now appear as **Active** in the TunnelFlow dashboard.

> **Tip:** If you need `cloudflared` running on every node (e.g. to expose node-local services), change `kind: Deployment` to `kind: DaemonSet` and remove the `replicas` field.

---

### Backup

The entire state is in a single SQLite file. Back it up with:
```bash
# Hot backup (safe while running)
sqlite3 /data/tunnel-manager.db ".backup /backup/tunnel-manager-$(date +%Y%m%d).db"

# Or simply copy the file when the app is stopped
cp /data/tunnel-manager.db /backup/
```

---

## Development

```bash
git clone https://github.com/stwins60/tunnelflow.git
cd tunnelflow
npm install
cp .env.example .env   # fill in ENCRYPTION_KEY and SESSION_SECRET

# Start dev server with hot reload
npm run dev

# Type-check
npx tsc --noEmit

# Build for production (uses a temp DB)
DATABASE_URL=file:/tmp/build-test.db npm run build
```

### Project conventions

- All DB mutations use additive `ALTER TABLE ... ADD COLUMN` migrations wrapped in `try/catch` — never destructive
- Sensitive values are always AES-256-GCM encrypted before insert via `encrypt()` in `src/lib/crypto.ts`
- Multi-tenancy: all resource queries use `resolveWorkspaceId(userId)` — invited users see their owner's resources
- `requireAdmin()` / `requireEditor()` / `requireAuth()` from `src/lib/session.ts` gate every route handler

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
