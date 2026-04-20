'use client'


import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, signOut, User } from 'firebase/auth'
import { auth } from '@/lib/firebase-client'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<User | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) { setLoading(false); return }
    if (!auth) { setLoading(false); return }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/admin/login')
        setLoading(false)
        return
      }
      const tokenResult = await user.getIdTokenResult()
      if (!tokenResult.claims.wismo_admin) {
        await signOut(auth)
        router.replace('/admin/login')
        setLoading(false)
        return
      }
      setAdmin(user)
      setLoading(false)
    })
    return unsub
  }, [router, isLoginPage])

  // Login page: render directly, no sidebar
  if (isLoginPage) return <>{children}</>

  if (loading || !admin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a' }}>
        <div style={{ width: 28, height: 28, border: '2px solid #333', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <aside style={{ width: 220, background: '#0a0a0a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #1f1f1f' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/wismo-logo.svg" alt="WISMO" style={{ height: 28, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
            <span style={{ color: '#525252', fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Admin</span>
          </div>
          <div style={{ color: '#525252', fontSize: 10, marginTop: 4, marginLeft: 34 }}>{admin.email}</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {[
            { href: '/admin/dashboard', label: 'Overview', icon: '📊' },
            { href: '/admin/manufacturers', label: 'Manufacturers', icon: '🏭' },
            { href: '/admin/infrastructure', label: 'Infrastructure', icon: '🔧' },
            { href: '/admin/billing', label: 'Billing', icon: '💰' },
            { href: '/admin/audit', label: 'Audit Log', icon: '📋' },
            { href: '/admin/errors', label: 'Error Log', icon: '⚠️' },
            { href: '/admin/flags', label: 'Feature Flags', icon: '🚩' },
            { href: '/admin/announcement', label: 'Announcement', icon: '📣' },
          ].map(({ href, label, icon }) => (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, marginBottom: 2,
              textDecoration: 'none', fontSize: 13, fontWeight: 500,
              color: pathname.startsWith(href) ? 'white' : '#737373',
              background: pathname.startsWith(href) ? '#1f1f1f' : 'transparent',
            }}>
              <span style={{ fontSize: 14 }}>{icon}</span> {label}
            </Link>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', borderTop: '1px solid #1f1f1f' }}>
          <button
            onClick={() => signOut(auth).then(() => router.replace('/admin/login'))}
            style={{ width: '100%', padding: '7px 10px', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#737373', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
