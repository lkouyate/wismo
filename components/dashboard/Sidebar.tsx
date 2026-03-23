'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase-client'
import { useAuth } from '@/components/providers/FirebaseProvider'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '▦' },
  { href: '/dashboard/drafts', label: 'Drafts', icon: '✎' },
  { href: '/dashboard/conversations', label: 'Conversations', icon: '💬' },
  { href: '/dashboard/escalations', label: 'Escalations', icon: '⚠' },
  { href: '/dashboard/customers', label: 'Customers', icon: '👥' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: '🔌' },
]

const SETTINGS_ITEMS = [
  { href: '/dashboard/settings/agent', label: 'Agent Settings', icon: '🤖' },
  { href: '/dashboard/settings/channels', label: 'Channels', icon: '📡' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <nav style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--white)',
      borderRight: '1px solid var(--gray-200)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '1.25rem 1rem',
        borderBottom: '1px solid var(--gray-200)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontWeight: 700,
        fontSize: '1.05rem',
      }}>
        <div style={{
          width: 28, height: 28, background: 'var(--black)', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 800 }}>W</span>
        </div>
        WISMO
      </div>

      {/* Main nav */}
      <div style={{ padding: '0.5rem 0', flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: isActive(item.href) ? 'var(--black)' : 'var(--gray-500)',
            background: isActive(item.href) ? 'var(--gray-50)' : 'transparent',
            textDecoration: 'none',
            fontWeight: isActive(item.href) ? 600 : 400,
            borderLeft: isActive(item.href) ? '2px solid var(--black)' : '2px solid transparent',
            transition: 'all 0.1s',
          }}>
            <span style={{ fontSize: '0.9rem', width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Settings
        </div>

        {SETTINGS_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: isActive(item.href) ? 'var(--black)' : 'var(--gray-500)',
            background: isActive(item.href) ? 'var(--gray-50)' : 'transparent',
            textDecoration: 'none',
            fontWeight: isActive(item.href) ? 600 : 400,
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
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', color: 'var(--gray-400)', padding: 0,
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
