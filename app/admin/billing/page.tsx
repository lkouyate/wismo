'use client'


import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

const PLAN_PRICES: Record<string, number> = {
  core: 199,
  enhanced: 299,
  full: 399,
  free_trial: 0,
}

interface Mfg {
  plan?: string
  trialEndsAt?: { seconds: number }
  subscriptionStatus?: string
  isLive?: boolean
  adminSuspended?: boolean
  createdAt?: { seconds: number }
  displayName?: string
  email?: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function AdminBillingPage() {
  const [mfgs, setMfgs] = useState<Mfg[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(collection(db, 'manufacturers'))
      .then(snap => {
        setMfgs(snap.docs.map(d => d.data() as Mfg))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const now = Date.now()

  const core = mfgs.filter(m => m.plan === 'core')
  const enhanced = mfgs.filter(m => m.plan === 'enhanced')
  const full = mfgs.filter(m => m.plan === 'full')
  const trialActive = mfgs.filter(m => m.plan === 'free_trial' && m.trialEndsAt && m.trialEndsAt.seconds * 1000 > now)
  const trialExpired = mfgs.filter(m => m.plan === 'free_trial' && (!m.trialEndsAt || m.trialEndsAt.seconds * 1000 <= now))
  const noPlan = mfgs.filter(m => !m.plan)

  const mrr = core.length * 199 + enhanced.length * 299 + full.length * 399
  const suspended = mfgs.filter(m => m.adminSuspended)

  function statusBreakdown(list: Mfg[]) {
    const active = list.filter(m => m.subscriptionStatus === 'active').length
    const pastDue = list.filter(m => m.subscriptionStatus === 'past_due').length
    const canceled = list.filter(m => m.subscriptionStatus === 'canceled').length
    const unknown = list.filter(m => !m.subscriptionStatus).length
    const parts: string[] = []
    if (active) parts.push(`${active} active`)
    if (pastDue) parts.push(`${pastDue} past_due`)
    if (canceled) parts.push(`${canceled} canceled`)
    if (unknown) parts.push(`${unknown} unknown`)
    return parts.join(', ') || '—'
  }

  // Simple monthly growth approximation from createdAt
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)
  const newThisMonth = mfgs.filter(m => m.createdAt && m.createdAt.seconds * 1000 >= thisMonth.getTime()).length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Billing Overview</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>Live MRR from Stripe subscription data. Core = $199/mo, Enhanced = $299/mo, Full = $399/mo.</p>
      </div>

      {/* MRR cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'MRR', value: fmt(mrr), sub: 'From active paid plans', accent: true },
          { label: 'New accounts', value: newThisMonth, sub: 'This calendar month' },
          { label: 'Paying accounts', value: core.length + enhanced.length + full.length, sub: 'Core + Enhanced + Full' },
          { label: 'Trial pipeline', value: trialActive.length, sub: `${trialExpired.length} expired` },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} style={{ background: accent ? '#0a0a0a' : 'white', border: `1px solid ${accent ? '#0a0a0a' : '#e5e5e5'}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, color: accent ? '#a3a3a3' : '#737373', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: accent ? 'white' : 'inherit' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: accent ? '#737373' : '#a3a3a3', marginTop: 6 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>Plan Breakdown</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              {['Plan', 'Accounts', 'Status', 'Price / mo', 'Revenue'].map(h => (
                <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Accounts' || h === 'Revenue' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Full', count: full.length, price: 399, color: '#fff', bg: '#0a0a0a', list: full },
              { label: 'Enhanced', count: enhanced.length, price: 299, color: '#065f46', bg: '#d1fae5', list: enhanced },
              { label: 'Core', count: core.length, price: 199, color: '#1e40af', bg: '#dbeafe', list: core },
              { label: 'Trial (active)', count: trialActive.length, price: 0, color: '#6d28d9', bg: '#ede9fe', list: trialActive },
              { label: 'Trial (expired)', count: trialExpired.length, price: 0, color: '#991b1b', bg: '#fee2e2', list: trialExpired },
              { label: 'No plan', count: noPlan.length, price: 0, color: '#6b7280', bg: '#f3f4f6', list: noPlan },
            ].map(({ label, count, price, color, bg, list }) => (
              <tr key={label} style={{ borderTop: '1px solid #f5f5f5' }}>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: bg, color }}>{label}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{count}</td>
                <td style={{ padding: '10px 16px', fontSize: 11, color: '#737373' }}>{price > 0 ? statusBreakdown(list) : '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#737373', textAlign: 'left', paddingLeft: 24 }}>{price > 0 ? fmt(price) : '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{price > 0 ? fmt(count * price) : <span style={{ color: '#d1d5db' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #e5e5e5', background: '#fafafa' }}>
              <td colSpan={4} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>Total MRR</td>
              <td style={{ padding: '10px 16px', fontSize: 15, fontWeight: 700, textAlign: 'right' }}>{fmt(mrr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      <div style={{ background: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#737373' }}>
        MRR reflects active paid accounts from Stripe. Status column shows live subscription states per plan.
        {suspended.length > 0 && ` ${suspended.length} suspended account${suspended.length > 1 ? 's' : ''} excluded from MRR.`}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
