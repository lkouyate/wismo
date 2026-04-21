'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

type Period = '7d' | '30d' | '90d'

interface ApiStats {
  total: number
  positive: number
  negative: number
  edited: number
  unrated: number
  acceptRate: number
  reasonCounts: Record<string, number>
  recentNegative: { original: string; edited: string; reasons: string[] }[]
}

export default function QualityPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ApiStats>({
    total: 0, positive: 0, negative: 0, edited: 0, unrated: 0,
    acceptRate: 100, reasonCounts: {}, recentNegative: [],
  })
  const [confCounts, setConfCounts] = useState({ high: 0, medium: 0, needs_attention: 0 })

  useEffect(() => {
    if (!user) return
    loadQuality()
  }, [user, period])

  async function loadQuality() {
    if (!user) return
    setLoading(true)

    try {
      const { currentUser } = await import('@/lib/firebase-client').then(m => ({ currentUser: m.auth.currentUser }))
      const idToken = await currentUser?.getIdToken()
      if (!idToken) return

      // Fetch aggregated feedback from API
      const res = await fetch(`/api/feedback?period=${period}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (res.ok) {
        setStats(await res.json())
      }

      // Load confidence distribution from conversations (client-side — lightweight)
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
      const since = new Date(Date.now() - days * 86400000)
      const convRef = collection(db, 'manufacturers', user.uid, 'conversations')
      const convQuery = query(convRef, where('createdAt', '>=', since), where('status', '==', 'resolved'), orderBy('createdAt', 'desc'))
      const convSnap = await getDocs(convQuery)
      const counts = { high: 0, medium: 0, needs_attention: 0 }
      for (const d of convSnap.docs) {
        const k = d.data().confidence as keyof typeof counts
        if (k in counts) counts[k]++
      }
      setConfCounts(counts)
    } catch { /* ignore */ }

    setLoading(false)
  }

  const REASON_LABELS: Record<string, string> = {
    tone: 'Wrong tone',
    accuracy: 'Inaccurate info',
    missing_info: 'Missing details',
    too_long: 'Too long',
    too_short: 'Too short',
    other: 'Other',
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>AI Quality</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2 }}>How well is the AI performing?</p>
        </div>
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
          { label: 'Accept rate', value: loading ? '\u2014' : `${stats.acceptRate}%`, color: stats.acceptRate >= 80 ? '#16a34a' : stats.acceptRate >= 60 ? '#ca8a04' : '#dc2626' },
          { label: 'Total responses', value: loading ? '\u2014' : stats.total, color: undefined },
          { label: 'Positive ratings', value: loading ? '\u2014' : stats.positive, color: '#16a34a' },
          { label: 'Needs work', value: loading ? '\u2014' : stats.negative, color: stats.negative > 0 ? '#dc2626' : undefined },
        ].map(m => (
          <div key={m.label} className="card">
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Feedback reasons breakdown */}
      {Object.keys(stats.reasonCounts).length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Top feedback reasons</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(stats.reasonCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => {
                const maxCount = Math.max(...Object.values(stats.reasonCounts))
                const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                return (
                  <div key={reason}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--gray-600)' }}>{REASON_LABELS[reason] ?? reason}</span>
                      <span style={{ color: 'var(--gray-400)' }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#6366f1', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Confidence distribution */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Confidence distribution</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'High', count: confCounts.high, color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Medium', count: confCounts.medium, color: '#ca8a04', bg: '#fefce8' },
              { label: 'Needs attention', count: confCounts.needs_attention, color: '#dc2626', bg: '#fef2f2' },
            ].map(c => {
              const total = confCounts.high + confCounts.medium + confCounts.needs_attention
              const pct = total > 0 ? Math.round((c.count / total) * 100) : 0
              return (
                <div key={c.label} style={{ flex: 1, background: c.bg, borderRadius: 10, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{pct}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 4 }}>{c.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{c.count} responses</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent corrections */}
      {stats.recentNegative.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Recent corrections</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.recentNegative.map((ex, i) => (
              <div key={i} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
                {ex.reasons.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {ex.reasons.map(r => (
                      <span key={r} style={{
                        padding: '0.15rem 0.5rem', borderRadius: 9999,
                        background: '#eef2ff', color: '#4338ca',
                        fontSize: '0.65rem', fontWeight: 500,
                      }}>
                        {REASON_LABELS[r] ?? r}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: 4 }}>
                  <strong>AI wrote:</strong> {ex.original}...
                </div>
                <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                  <strong>Corrected to:</strong> {ex.edited}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
