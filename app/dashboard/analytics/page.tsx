'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

type Period = '7d' | '30d' | '90d'

interface DayBucket {
  date: string
  total: number
  resolved: number
  escalated: number
  draft: number
}

interface TopCustomer {
  company: string
  email: string
  count: number
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [daily, setDaily] = useState<DayBucket[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [totals, setTotals] = useState({ total: 0, resolved: 0, escalated: 0, avgConfidence: '' })

  useEffect(() => {
    if (!user) return
    loadAnalytics()
  }, [user, period])

  async function loadAnalytics() {
    if (!user) return
    setLoading(true)

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    const since = new Date(Date.now() - days * 86400000)

    const colRef = collection(db, 'manufacturers', user.uid, 'conversations')
    const q = query(colRef, where('createdAt', '>=', since), orderBy('createdAt', 'desc'))

    try {
      const snap = await getDocs(q)
      const docs = snap.docs.map(d => ({ ...d.data() } as {
        status: string; confidence: string; customerCompany: string
        customerEmail: string; createdAt: Timestamp
      }))

      // Daily buckets
      const buckets = new Map<string, DayBucket>()
      for (const d of docs) {
        const date = d.createdAt?.toDate?.()
        if (!date) continue
        const key = date.toISOString().slice(0, 10)
        const b = buckets.get(key) ?? { date: key, total: 0, resolved: 0, escalated: 0, draft: 0 }
        b.total++
        if (d.status === 'resolved') b.resolved++
        else if (d.status === 'escalated') b.escalated++
        else if (d.status === 'draft') b.draft++
        buckets.set(key, b)
      }
      const sortedDaily = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date))
      setDaily(sortedDaily)

      // Top customers
      const customerMap = new Map<string, TopCustomer>()
      for (const d of docs) {
        const key = d.customerEmail
        const existing = customerMap.get(key)
        if (existing) { existing.count++ }
        else { customerMap.set(key, { company: d.customerCompany, email: key, count: 1 }) }
      }
      setTopCustomers(
        Array.from(customerMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
      )

      // Totals
      const resolved = docs.filter(d => d.status === 'resolved').length
      const escalated = docs.filter(d => d.status === 'escalated').length
      const confMap: Record<string, number> = { high: 3, medium: 2, needs_attention: 1 }
      const confSum = docs.reduce((s, d) => s + (confMap[d.confidence] ?? 0), 0)
      const avgConf = docs.length > 0 ? confSum / docs.length : 0
      const avgLabel = avgConf >= 2.5 ? 'High' : avgConf >= 1.5 ? 'Medium' : 'Low'
      setTotals({ total: docs.length, resolved, escalated, avgConfidence: avgLabel })
    } catch { /* ignore */ }

    setLoading(false)
  }

  const maxDaily = Math.max(...daily.map(d => d.total), 1)

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Analytics</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--gray-100)', borderRadius: 9, padding: 4 }}>
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none',
                background: period === p ? 'var(--white)' : 'transparent',
                fontSize: '0.8rem', fontWeight: period === p ? 600 : 400, cursor: 'pointer',
                color: period === p ? 'var(--black)' : 'var(--gray-500)',
                boxShadow: period === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total queries', value: loading ? '—' : totals.total },
          { label: 'Resolved', value: loading ? '—' : totals.resolved },
          { label: 'Escalated', value: loading ? '—' : totals.escalated },
          { label: 'Avg confidence', value: loading ? '—' : totals.avgConfidence },
        ].map(m => (
          <div key={m.label} className="card">
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Daily volume chart (simple bar chart) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Daily query volume</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
        ) : daily.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
            No data for this period.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 160 }}>
            {daily.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--gray-400)' }}>{d.total}</div>
                <div style={{
                  width: '100%', maxWidth: 32,
                  height: `${Math.max((d.total / maxDaily) * 120, 4)}px`,
                  background: d.escalated > d.resolved ? '#fee2e2' : '#dcfce7',
                  borderRadius: '4px 4px 0 0',
                  border: `1px solid ${d.escalated > d.resolved ? '#fca5a5' : '#86efac'}`,
                }} />
                <div style={{ fontSize: '0.55rem', color: 'var(--gray-400)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                  {d.date.slice(5)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top customers */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Top customers by query volume</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
        ) : topCustomers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
            No customer data yet.
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--gray-200)', color: 'var(--gray-500)', fontWeight: 600 }}>Company</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--gray-200)', color: 'var(--gray-500)', fontWeight: 600 }}>Email</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid var(--gray-200)', color: 'var(--gray-500)', fontWeight: 600 }}>Queries</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map(c => (
                <tr key={c.email}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-100)' }}>{c.company}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-500)' }}>{c.email}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-100)', textAlign: 'right', fontWeight: 600 }}>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
