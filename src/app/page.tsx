import Link from 'next/link'
import {
  CloudLightning,
  Network,
  Server,
  Shield,
  Zap,
  Globe,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Lock,
  BarChart3,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <CloudLightning className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} />
            </div>
            <span className="text-lg font-bold tracking-tight">TunnelFlow</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-blue-50 to-white" />
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-blue-100/40 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
            <Zap className="h-3 w-3" />
            Powered by Cloudflare Tunnels
          </div>

          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
            Expose your servers{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              without opening ports
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 leading-relaxed">
            TunnelFlow lets you securely route public hostnames to your private services through Cloudflare Tunnels —
            with a clean dashboard, instant DNS provisioning, and drift detection.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-all hover:shadow-blue-600/40"
            >
              Start for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-4 text-sm text-gray-400">No credit card required · Free to get started</p>
        </div>

        {/* Dashboard preview mockup */}
        <div className="mx-auto mt-20 max-w-5xl px-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl shadow-gray-900/10">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <div className="ml-2 flex-1 rounded bg-white px-3 py-1 text-center text-xs font-mono text-gray-400">
                app.tunnelflow.io/dashboard
              </div>
            </div>
            {/* Fake dashboard UI */}
            <div className="bg-white p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="h-6 w-28 rounded-md bg-gray-900" />
                <div className="h-8 w-20 rounded-lg bg-blue-600" />
              </div>
              <div className="mb-6 grid grid-cols-4 gap-4">
                {[
                  { label: 'Tunnels', value: '3', color: 'bg-blue-500' },
                  { label: 'Servers', value: '12', color: 'bg-indigo-500' },
                  { label: 'Healthy', value: '11', color: 'bg-green-500' },
                  { label: 'Issues', value: '1', color: 'bg-amber-500' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className={`mb-2 h-2 w-2 rounded-full ${s.color}`} />
                    <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { name: 'prod-api', host: 'api.example.com', status: 'active', color: 'bg-green-500' },
                  { name: 'staging-web', host: 'staging.example.com', status: 'active', color: 'bg-green-500' },
                  { name: 'metrics', host: 'metrics.example.com', status: 'error', color: 'bg-amber-500' },
                ].map((r) => (
                  <div key={r.name} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${r.color}`} />
                      <span className="text-sm font-medium text-gray-900">{r.name}</span>
                    </div>
                    <span className="font-mono text-xs text-gray-400">{r.host}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to manage tunnels
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              A complete platform to connect your private services to the internet securely.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Network,
                title: 'Tunnel Management',
                description: 'Create and manage Cloudflare Tunnels from a single dashboard. No CLI, no YAML files.',
                color: 'text-blue-600 bg-blue-50',
              },
              {
                icon: Globe,
                title: 'Instant DNS Provisioning',
                description: 'Add a server hostname and TunnelFlow automatically creates the Cloudflare DNS CNAME record.',
                color: 'text-indigo-600 bg-indigo-50',
              },
              {
                icon: RefreshCw,
                title: 'Drift Detection',
                description: 'Automatic reconciliation detects when your local config and Cloudflare state diverge.',
                color: 'text-violet-600 bg-violet-50',
              },
              {
                icon: Shield,
                title: 'Secure by Design',
                description: 'API tokens are encrypted at rest with AES-256-GCM. Sessions use encrypted, signed cookies.',
                color: 'text-green-600 bg-green-50',
              },
              {
                icon: BarChart3,
                title: 'Audit Logging',
                description: 'Full audit trail of every action — tunnel creation, DNS changes, config updates — with timestamps and IP addresses.',
                color: 'text-orange-600 bg-orange-50',
              },
              {
                icon: Lock,
                title: 'Multi-Zone Support',
                description: 'Manage multiple Cloudflare zones and automatically route subdomains to the correct zone.',
                color: 'text-rose-600 bg-rose-50',
              },
            ].map(({ icon: Icon, title, description, color }) => (
              <div key={title} className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="bg-gray-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Get running in minutes
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Connect your Cloudflare account and start routing traffic in four simple steps.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Create an account',
                description: 'Sign up with your email. No credit card needed to get started.',
              },
              {
                step: '02',
                title: 'Add your CF credentials',
                description: 'Paste your Cloudflare API token and select the zones you want to manage.',
              },
              {
                step: '03',
                title: 'Create a tunnel',
                description: 'TunnelFlow creates a Cloudflare Tunnel in your account with one click.',
              },
              {
                step: '04',
                title: 'Add servers',
                description: 'Add a hostname and upstream URL. DNS is created automatically.',
              },
            ].map(({ step, title, description }) => (
              <div key={step} className="relative">
                <div className="mb-4 text-4xl font-black text-blue-100">{step}</div>
                <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What's included ── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                A complete tunnel management platform
              </h2>
              <p className="mt-4 text-lg text-gray-500">
                TunnelFlow takes the complexity out of self-hosted Cloudflare Tunnel management,
                giving you a professional interface with enterprise-grade features.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  'One-click tunnel and DNS record creation',
                  'Automatic Cloudflare state reconciliation',
                  'Encrypted credential storage with AES-256-GCM',
                  'Per-user isolation — your data stays yours',
                  'Multi-zone domain management',
                  'Full audit log with IP tracking',
                  'Role-based access control (Admin / Viewer)',
                  'Real-time sync status in the dashboard',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 font-mono text-sm">
              <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>Sync complete — 3 tunnels reconciled</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-blue-500" />
                    <span className="text-gray-700">prod-tunnel</span>
                  </div>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">active</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    <span className="text-gray-700">api.example.com</span>
                  </div>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">active</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    <span className="text-gray-700">app.example.com</span>
                  </div>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">active</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-violet-500" />
                    <span className="text-gray-700">example.com</span>
                  </div>
                  <span className="text-xs text-gray-400">zone active</span>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-400">Last synced just now · No drift detected</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Start managing your tunnels today
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Set up your Cloudflare credentials in minutes. No infrastructure to manage,
            no CLI to learn — just a clean dashboard for your tunnels.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-all"
            >
              Create free account
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-gray-50 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
                <CloudLightning className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">TunnelFlow</span>
            </div>
            <p className="text-sm text-gray-400">
              Built on top of Cloudflare Tunnels. Not affiliated with Cloudflare, Inc.
            </p>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
              <Link href="/register" className="hover:text-gray-600 transition-colors">Register</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
