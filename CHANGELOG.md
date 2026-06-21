# Changelog

All notable changes to TunnelFlow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-06-21

### Changed
- **Health monitoring behavior** — health checks now treat any HTTP response as reachable, with fallback from `HEAD` to `GET` for services that reject `HEAD`
- **External reachability fallback** — when direct upstream checks fail (for example isolated Docker networks), health checks now probe the public server hostname to reduce false `Down` states
- **Legacy server coverage** — health checks and per-server health API now include legacy records where `userId` is `NULL`
- **Tunnel install UX** — install command dialogs now preserve line breaks and support both vertical and horizontal scrolling for long commands/tokens

### Fixed
- **Tunnel token response parsing** — tunnel token retrieval now supports both Cloudflare response shapes (raw string and object with `token` field)
- **Setup validation** — setup now preflights Cloudflare permissions for tunnel management and DNS edits, returning explicit validation errors early
- **Kubernetes install command** — deployment flow now reads token from Kubernetes secret instead of hardcoding token in deployment command args

### Breaking
- **Release major bump** — this release promotes behavior changes in health-state calculation and setup validation under semantic versioning `2.0.0`

---

## [1.2.0] - 2026-06-18

### Improved
- **Docker install command** — automatically creates a dedicated Docker network (`cloudflared-<name>`) before running the container, isolating tunnel traffic
- **systemd install command** — generates a complete, production-ready systemd unit file (`/etc/systemd/system/cloudflared-<name>.service`) with `Restart=on-failure` and `RestartSec=5s` instead of using the deprecated `cloudflared service install`
- **Kubernetes install command** — scopes all resources to a dedicated namespace (`cloudflared-<name>`) to avoid collisions in shared clusters

---

## [1.1.1] - 2026-06-15

### Changed

- feat: add template picker and info banner to enhance server route creation
- ci: add automated bump-release workflow

---

## [1.1.0] - 2026-06-14

### Added
- **Extended protocol support** — servers now support `tcp`, `ssh`, `rdp`, and `smb` in addition to `http`/`https`, matching all Cloudflare Tunnel ingress service types
- **DNS record tracking & audit** — all Cloudflare DNS records managed by TunnelFlow are tracked in the local database with full create/update/delete audit history
- **DNS records dashboard page** — new `/dashboard/dns-records` view with search, zone filtering, and per-record history
- **DNS backfill API** (`POST /api/dns-records/backfill`) — retroactively import existing Cloudflare DNS records into the local audit store
- **First-time user onboarding** — registration step 4 now shows a step-by-step getting-started guide; the dashboard shows an interactive onboarding checklist for new accounts with no tunnels or servers
- **Auto health check on dashboard load** — the Healthy stat card is populated automatically on page load instead of requiring a manual button click; shows a loading indicator while the check is in flight

### Changed
- Protocol enum on `Server` expanded from `['http','https']` to `['http','https','tcp','ssh','rdp','smb']` in both API routes and the add-server form
- Upstream URL validation regex broadened to accept any valid URI scheme (not just `http://`/`https://`)
- Dashboard "No tunnels yet" empty state replaced with a richer onboarding guide card

### Fixed
- Dashboard Healthy card showed `—` for existing users until they manually ran a health check

---

## [1.0.0] - 2026-06-09

### Added

#### Core platform
- Multi-user authentication with invite-based registration
- Role-based access control: `ADMIN`, `EDITOR`, `VIEWER`
- User groups with additive permission resolution
- Iron-session signed cookies with configurable `SESSION_SECRET`
- Audit log with before/after diff view for every state-changing action

#### Cloudflare Tunnel management
- Provision and deprovision Cloudflare Tunnels via API
- Server (route) management per tunnel with full CRUD
- Live sync with Cloudflare to reconcile drift
- Multi-account support — store multiple CF API tokens (AES-256-GCM encrypted)

#### Health monitoring
- HTTP HEAD polling with 10 s timeout per server
- States: `up`, `down`, `timeout`, `error` with automatic transition notifications
- Per-server health history (last 100 checks retained)
- Maintenance windows — suppress alerts during scheduled downtime
- "Run Health Check" button on dashboard overview
- Health badge and response-time display on server cards

#### API keys
- `tfk_<64-hex>` format; SHA-256 hash-only storage; raw key shown once
- Scoped permissions: `read`, `write`, `deploy`, `admin`
- Bearer token auth on deployment API

#### Deployment API
- `POST /api/deploy` — provision a server via Bearer token
- `DELETE /api/deploy` — deprovision a server via Bearer token

#### Config-as-code
- `GET /api/config` — export entire workspace as YAML
- `POST /api/config` — dry-run diff or apply import from YAML (`version: 1` schema)

#### Route templates
- Saved presets for common route configurations
- Full CRUD via UI and REST API

#### Notifications
- 10 configurable events including `server.down` and `server.up`
- Channels: email (SMTP), webhook

#### Security & reliability
- AES-256-GCM encryption for all sensitive values at rest
- Sliding-window rate limiting in middleware (configurable via env vars)
- Full security headers on every response (`HSTS`, `CSP`, `X-Frame-Options`, etc.)
- Per-IP `Retry-After` header on 429 responses
- JSON-line structured request logger

#### Developer experience
- GitHub Actions CI — type check + Next.js build on every push/PR to `master`/`develop`
- GitHub Actions release — GitHub Release with changelog on `v*.*.*` tags
- Comprehensive `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` (MIT)
- PR template and issue templates (bug report, feature request)
