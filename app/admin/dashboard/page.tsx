'use client'


import { useEffect, useState } from 'react'
import { collection, getDocs, query, where, collectionGroup } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

interface MfgSummary {
  isLive?: boolean
  onboardingComplete?: boolean
  adminSuspended?: boolean
  plan?: string
  trialEndsAt?: { seconds: number }
  gmailConnected?: boolean
  gmailWatchExpiry?: { seconds: number }
}

interface StatCardProps { label: string; value: React.ReactNode; sub?: string }

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#a3a3a3', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const [mfgs, setMfgs] = useState<MfgSummary[]>([])
  const [openEscalations, setOpenEscalations] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'manufacturers')),
      getDocs(query(collectionGroup(db, 'escalations'), where('status', '==', 'open'))),
    ]).then(([mfgSnap, escSnap]) => {
      setMfgs(mfgSnap.docs.map(d => d.data() as MfgSummary))
      setOpenEscalations(escSnap.size)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const now = Date.now()
  const live = mfgs.filter(m => m.isLive && !m.adminSuspended).length
  const suspended = mfgs.filter(m => m.adminSuspended).length
  const setup = mfgs.filter(m => !m.isLive && !m.adminSuspended).length
  const watchExpired = mfgs.filter(m =>
    m.gmailConnected && m.gmailWatchExpiry && (m.gmailWatchExpiry.seconds * 1000) < now
  ).length
  const watchActive = mfgs.filter(m =>
    m.gmailConnected && m.gmailWatchExpiry && (m.gmailWatchExpiry.seconds * 1000) >= now
  ).length

  const planCounts = {
    pro: mfgs.filter(m => m.plan === 'pro').length,
    starter: mfgs.filter(m => m.plan === 'starter').length,
    trialActive: mfgs.filter(m => m.plan === 'free_trial' && m.trialEndsAt && m.trialEndsAt.seconds * 1000 > now).length,
    trialExpired: mfgs.filter(m => m.plan === 'free_trial' && (!m.trialEndsAt || m.trialEndsAt.seconds * 1000 <= now)).length,
    none: mfgs.filter(m => !m.plan).length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Platform Overview</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>{mfgs.length} total accounts</p>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total accounts" value={mfgs.length} />
        <StatCard label="Live" value={<span style={{ color: '#166534' }}>{live}</span>} sub="Agent running" />
        <StatCard label="Open escalations" value={<span style={{ color: (openEscalations ?? 0) > 0 ? '#991b1b' : '#166534' }}>{openEscalations ?? '…'}</span>} sub="Across all accounts" />
        <StatCard label="Suspended" value={<span style={{ color: suspended > 0 ? '#92400e' : '#a3a3a3' }}>{suspended}</span>} sub="Admin-suspended" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Plan distribution */}
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>Plan Distribution</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { label: 'Pro', count: planCounts.pro, color: '#fff', bg: '#0a0a0a' },
                { label: 'Starter', count: planCounts.starter, color: '#1e40af', bg: '#dbeafe' },
                { label: 'Trial (active)', count: planCounts.trialActive, color: '#6d28d9', bg: '#ede9fe' },
                { label: 'Trial (expired)', count: planCounts.trialExpired, color: '#991b1b', bg: '#fee2e2' },
                { label: 'No plan', count: planCounts.none, color: '#6b7280', bg: '#f3f4f6' },
              ].map(({ label, count, color, bg }) => (
                <tr key={label} style={{ borderTop: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '9px 16px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: bg, color }}>{label}</span>
                  </td>
                  <td style={{ padding: '9px 16px', fontSize: 22, fontWeight: 700, textAlign: 'right' }}>{count}</td>
                  <td style={{ padding: '9px 16px', width: 80 }}>
                    <div style={{ height: 6, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${mfgs.length ? (count / mfgs.length) * 100 : 0}%`, background: bg === '#f3f4f6' ? '#d1d5db' : bg }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Gmail watch health */}
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>Gmail Watch Health</div>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#166534' }}>{watchActive}</div>
                <div style={{ fontSize: 11, color: '#737373', marginTop: 4 }}>Active</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: watchExpired > 0 ? '#991b1b' : '#a3a3a3' }}>{watchExpired}</div>
                <div style={{ fontSize: 11, color: '#737373', marginTop: 4 }}>Expired</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#a3a3a3' }}>{mfgs.filter(m => !m.gmailConnected).length}</div>
                <div style={{ fontSize: 11, color: '#737373', marginTop: 4 }}>Not connected</div>
              </div>
            </div>
            {watchExpired > 0 && (
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
                ⚠ {watchExpired} account{watchExpired > 1 ? 's have' : ' has'} expired Gmail watch — emails won't be processed until renewed.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Setup breakdown */}
      <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 24 }}>
        <div style={{ fontSize: 12, color: '#737373' }}>
          Setup in progress: <strong style={{ color: '#0a0a0a' }}>{setup}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#737373' }}>
          Onboarding complete: <strong style={{ color: '#0a0a0a' }}>{mfgs.filter(m => m.onboardingComplete).length}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#737373' }}>
          Gmail connected: <strong style={{ color: '#0a0a0a' }}>{mfgs.filter(m => m.gmailConnected).length}</strong>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
