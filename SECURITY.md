# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`main`) | Yes |
| Tagged releases | Latest tag only |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **security@tunnelflow** (or open a [GitHub Security Advisory](https://github.com/stwins60/tunnelflow/security/advisories/new)) with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if available)
- The affected version(s)

You'll receive an acknowledgement within **48 hours** and a resolution timeline within **7 days**.

## Security Design Notes

- Cloudflare API tokens, webhook URLs, and SMTP passwords are **AES-256-GCM encrypted at rest** using your `ENCRYPTION_KEY`. Losing this key means losing access to stored credentials.
- Session cookies are `httpOnly`, `SameSite=strict`, signed with `SESSION_SECRET`.
- API keys store only a **SHA-256 hash** — the raw key is shown once at creation.
- All auth endpoints are rate-limited (configurable via `RATE_LIMIT_MAX_AUTH`).
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `HSTS` when HTTPS) are applied by middleware on every response.
- Audit log records every state-changing action with actor, IP, and before/after diff. Secrets are **never** written to the audit log.
