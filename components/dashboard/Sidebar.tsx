'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth, db } from '@/lib/firebase-client'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '▦' },
  { href: '/dashboard/drafts', label: 'Drafts', icon: '✎' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: '💬' },
  { href: '/dashboard/escalations', label: 'Escalations', icon: '⚠' },
  { href: '/dashboard/customers', label: 'Customers', icon: '👥' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
  { href: '/dashboard/analytics/quality', label: 'AI Quality', icon: '✓' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: '🔌' },
  { href: '/dashboard/test-agent', label: 'Test Agent', icon: '🧪' },
]

const SETTINGS_ITEMS = [
  { href: '/dashboard/settings/profile', label: 'Profile & Account', icon: '👤' },
  { href: '/dashboard/settings/billing', label: 'Billing & Plans', icon: '💳' },
  { href: '/dashboard/settings/agent', label: 'Agent Settings', icon: '🤖' },
  { href: '/dashboard/settings/channels', label: 'Channels', icon: '📡' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [draftCount, setDraftCount] = useState(0)

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  useEffect(() => {
    if (!user || !db) return
    const q = query(
      collection(db, 'manufacturers', user.uid, 'conversations'),
      where('status', '==', 'draft')
    )
    return onSnapshot(q, snap => setDraftCount(snap.size), () => {})
  }, [user])

  return (
    <nav style={{
      width: 220, minHeight: '100vh', background: 'var(--white)',
      borderRight: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--gray-200)' }}>
        <img src="/wismo-logo.svg" alt="WISMO" style={{ height: 'clamp(28px, 2.5vw, 36px)', width: 'auto', display: 'block', maxWidth: '100%' }} />
      </div>

      {/* Main nav */}
      <div style={{ padding: '0.5rem 0', flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: isActive(item.href) ? 'var(--black)' : 'var(--gray-500)',
            background: isActive(item.href) ? 'var(--gray-50)' : 'transparent',
            textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
            borderLeft: isActive(item.href) ? '2px solid var(--black)' : '2px solid transparent',
            transition: 'all 0.1s',
          }}>
            <span style={{ fontSize: '0.9rem', width: 20, textAlign: 'center' }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.href === '/dashboard/drafts' && draftCount > 0 && (
              <span style={{
                background: 'var(--black)', color: 'white', borderRadius: 9999,
                fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center',
              }}>
                {draftCount}
              </span>
            )}
          </Link>
        ))}

        <div style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Settings
        </div>

        {SETTINGS_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: isActive(item.href) ? 'var(--black)' : 'var(--gray-500)',
            background: isActive(item.href) ? 'var(--gray-50)' : 'transparent',
            textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
            borderLeft: isActive(item.href) ? '2px solid var(--black)' : '2px solid transparent',
          }}>
            <span style={{ fontSize: '0.9rem', width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* User footer */}
      <div style={{ borderTop: '1px solid var(--gray-200)', padding: '0.75rem 1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
        <button
          onClick={() => signOut(auth)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--gray-400)', padding: 0 }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
