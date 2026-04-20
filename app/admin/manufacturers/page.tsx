'use client'


import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import Link from 'next/link'

interface Manufacturer {
  id: string
  email?: string
  displayName?: string
  isLive?: boolean
  onboardingComplete?: boolean
  gmailConnected?: boolean
  gmailEmail?: string
  katanaConnected?: boolean
  createdAt?: { seconds: number }
  draftMode?: boolean
  plan?: string
  trialEndsAt?: { seconds: number }
  planStartedAt?: { seconds: number }
}

function planBadge(m: Manufacturer) {
  if (m.plan === 'pro')        return { label: 'Pro', color: '#fff', bg: '#0a0a0a' }
  if (m.plan === 'starter')    return { label: 'Starter', color: '#1e40af', bg: '#dbeafe' }
  if (m.plan === 'free_trial') {
    const days = m.trialEndsAt ? Math.ceil((m.trialEndsAt.seconds * 1000 - Date.now()) / 86400000) : null
    const expired = days !== null && days <= 0
    return {
      label: expired ? 'Trial expired' : `Trial · ${days}d left`,
      color: expired ? '#991b1b' : '#6d28d9',
      bg:    expired ? '#fee2e2'  : '#ede9fe',
    }
  }
  return { label: 'No plan', color: '#9ca3af', bg: '#f3f4f6' }
}

function statusLabel(m: Manufacturer) {
  if (m.isLive) return { label: 'Live', color: '#166534', bg: '#dcfce7' }
  if (m.onboardingComplete) return { label: 'Paused', color: '#92400e', bg: '#fef9c3' }
  return { label: 'Setup', color: '#6b7280', bg: '#f3f4f6' }
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'manufacturers'), orderBy('createdAt', 'desc'))
    getDocs(q).then((snap) => {
      setManufacturers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Manufacturer)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Manufacturers</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>
          {loading ? 'Loading…' : `${manufacturers.length} accounts`}
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#737373', fontSize: 13 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          Loading manufacturers…
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7f7f7', borderBottom: '1px solid #e5e5e5' }}>
                {['Account', 'Plan', 'Status', 'Gmail', 'Katana', 'Onboarding', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manufacturers.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px 14px', textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>No manufacturers yet</td></tr>
              ) : manufacturers.map(m => {
                const st = statusLabel(m)
                const pl = planBadge(m)
                return (
                  <tr key={m.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{m.displayName ?? '—'}</div>
                      <div style={{ color: '#a3a3a3', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{m.email}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: pl.bg, color: pl.color }}>{pl.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12 }}>
                      {m.gmailConnected
                        ? <span style={{ color: '#166534' }}>✓ <span style={{ color: '#a3a3a3', fontFamily: 'monospace', fontSize: 11 }}>{m.gmailEmail}</span></span>
                        : <span style={{ color: '#d1d5db' }}>✗</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>
                      {m.katanaConnected ? <span style={{ color: '#166534' }}>✓</span> : <span style={{ color: '#d1d5db' }}>✗</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>
                      {m.onboardingComplete ? <span style={{ color: '#166534' }}>✓ Complete</span> : <span style={{ color: '#737373' }}>In progress</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#737373', whiteSpace: 'nowrap' }}>
                      {m.createdAt ? new Date(m.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/admin/manufacturers/${m.id}`} style={{ fontSize: 12, color: '#1e40af', textDecoration: 'none', fontWeight: 500 }}>
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
