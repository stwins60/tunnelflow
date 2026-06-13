'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Network,
  Server,
  Settings,
  LogOut,
  CloudLightning,
  ScrollText,
  Bell,
  Users,
  ChevronDown,
  Key,
  LayoutTemplate,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setEmail(d.data?.email ?? null)
          setIsAdmin(d.data?.accessLevel === 'ADMIN')
        }
      })
      .catch(() => null)
  }, [])

  const navItems = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, adminOnly: false },
    { href: '/dashboard/tunnels', label: 'Tunnels', icon: Network, adminOnly: false },
    { href: '/dashboard/servers', label: 'Servers', icon: Server, adminOnly: false },
    { href: '/dashboard/dns-records', label: 'DNS Records', icon: Globe, adminOnly: false },
    { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, adminOnly: false },
    { href: '/dashboard/api-keys', label: 'API Keys', icon: Key, adminOnly: false },
    { href: '/dashboard/templates', label: 'Templates', icon: LayoutTemplate, adminOnly: false },
    { href: '/dashboard/users', label: 'Users & Access', icon: Users, adminOnly: true },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings, adminOnly: true },
    { href: '/dashboard/audit', label: 'Audit Log', icon: ScrollText, adminOnly: false },
  ].filter(item => !item.adminOnly || isAdmin)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    toast.success('Logged out')
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-gray-950">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-800 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
          <CloudLightning className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-sm text-white">TunnelFlow</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 p-3 space-y-1">
        {email && (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{email}</p>
              <p className="text-xs text-gray-500">Admin</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
