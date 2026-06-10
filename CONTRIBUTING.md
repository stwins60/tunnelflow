# Contributing to TunnelFlow

Thanks for taking the time to contribute!

## Development Setup

```bash
git clone https://github.com/stwins60/tunnelflow.git
cd tunnelflow
npm install
cp .env.example .env   # add ENCRYPTION_KEY and SESSION_SECRET

npm run dev            # hot-reload dev server on :3000
npx tsc --noEmit       # type check
DATABASE_URL=file:/tmp/build-test.db npm run build   # production build check
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable — releases are tagged here |
| `develop` | Integration branch for features |
| `feat/*` | Feature branches — branch off `develop` |
| `fix/*` | Bug-fix branches |
| `chore/*` | Maintenance (deps, docs, refactors) |

## Submitting Changes

1. Fork the repo and create a branch from `develop`
2. Make your changes — keep commits focused and descriptive
3. Run `npx tsc --noEmit` and the build to verify no type errors
4. Open a Pull Request against `develop`

## Code Conventions

- **Database migrations** must be additive — `ALTER TABLE ... ADD COLUMN` in a `try/catch`, never destructive
- **Sensitive values** must be AES-256-GCM encrypted via `encrypt()` before insert; never log them
- **Multi-tenancy** — all resource queries must go through `resolveWorkspaceId(userId)`
- **Route auth** — every API route must call `requireAuth()`, `requireEditor()`, or `requireAdmin()`
- **Error handling** — use `ok()`, `err()`, `unauthorized()`, `notFound()`, `serverError()` from `@/lib/api-helpers`

## Commit Message Format

```
<type>(<scope>): <short summary>

[optional body]
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

Examples:
```
feat(api): add maintenance window CRUD routes
fix(health-checker): handle IPv6 upstream URLs
chore(deps): bump js-yaml to 4.2.0
```

## Reporting Bugs

Open a [GitHub Issue](https://github.com/stwins60/tunnelflow/issues/new?template=bug_report.md) using the bug report template.

## Requesting Features

Open a [GitHub Issue](https://github.com/stwins60/tunnelflow/issues/new?template=feature_request.md) using the feature request template.

## Security Vulnerabilities

See [SECURITY.md](SECURITY.md) — **do not** open a public issue.
