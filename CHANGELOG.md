# Changelog

All notable changes to TunnelFlow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
