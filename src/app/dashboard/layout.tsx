import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { isSetupComplete } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session.isLoggedIn || !session.userId) {
    redirect('/login')
  }

  // Check if this user has configured their Cloudflare credentials
  const setupDone = await isSetupComplete(session.userId)
  if (!setupDone) {
    redirect('/setup')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
