'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { collection, query, orderBy, getDocs, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

type Period = '7d' | '30d' | '90d'

interface FeedbackEntry {
  conversationId: string
  originalResponse: string
  editedResponse: string
  editDistance: number
  wasEdited: boolean
  createdAt: Timestamp
}

export default function QualityPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSent: 0,
    acceptedAsIs: 0,
    edited: 0,
    acceptRate: 0,
    avgEditDistance: 0,
    confidenceAccuracy: { high: 0, medium: 0, needs_attention: 0 },
    editTrend: [] as { date: string; rate: number }[],
  })

  useEffect(() => {
    if (!user) return
    loadQuality()
  }, [user, period])

  async function loadQuality() {
    if (!user) return
    setLoading(true)

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    const since = new Date(Date.now() - days * 86400000)

    try {
      // Load feedback entries
      const feedbackRef = collection(db, 'manufacturers', user.uid, 'feedback')
      const fbQuery = query(feedbackRef, where('createdAt', '>=', since), orderBy('createdAt', 'desc'))
      const fbSnap = await getDocs(fbQuery)
      const feedback = fbSnap.docs.map(d => d.data() as FeedbackEntry)

      // Load conversations for confidence accuracy
      const convRef = collection(db, 'manufacturers', user.uid, 'conversations')
      const convQuery = query(convRef, where('createdAt', '>=', since), where('status', '==', 'resolved'), orderBy('createdAt', 'desc'))
      const convSnap = await getDocs(convQuery)
      const conversations = convSnap.docs.map(d => d.data() as { confidence: string; status: string; createdAt: Timestamp })

      const totalSent = conversations.length + feedback.length
      const edited = feedback.filter(f => f.wasEdited).length
      const acceptedAsIs = totalSent - edited
      const acceptRate = totalSent > 0 ? Math.round((acceptedAsIs / totalSent) * 100) : 0
      const avgEditDistance = edited > 0
        ? Math.round(feedback.filter(f => f.wasEdited).reduce((s, f) => s + f.editDistance, 0) / edited)
        : 0

      // Confidence distribution
      const confCounts = { high: 0, medium: 0, needs_attention: 0 }
      for (const c of conversations) {
        const k = c.confidence as keyof typeof confCounts
        if (k in confCounts) confCounts[k]++
      }

      // Edit rate trend (daily)
      const dailyMap = new Map<string, { total: number; edited: number }>()
      for (const f of feedback) {
        const date = f.createdAt?.toDate?.()
        if (!date) continue
        const key = date.toISOString().slice(0, 10)
        const b = dailyMap.get(key) ?? { total: 0, edited: 0 }
        b.total++
        if (f.wasEdited) b.edited++
        dailyMap.set(key, b)
      }
      const editTrend = Array.from(dailyMap.entries())
        .map(([date, b]) => ({ date, rate: b.total > 0 ? Math.round((b.edited / b.total) * 100) : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setStats({ totalSent, acceptedAsIs, edited, acceptRate, avgEditDistance, confidenceAccuracy: confCounts, editTrend })
    } catch { /* ignore */ }

    setLoading(false)
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
          { label: 'Accept-as-is rate', value: loading ? '—' : `${stats.acceptRate}%`, color: stats.acceptRate >= 80 ? '#16a34a' : stats.acceptRate >= 60 ? '#ca8a04' : '#dc2626' },
          { label: 'Total sent', value: loading ? '—' : stats.totalSent, color: undefined },
          { label: 'Edited before send', value: loading ? '—' : stats.edited, color: undefined },
          { label: 'Avg edit distance', value: loading ? '—' : `${stats.avgEditDistance} chars`, color: undefined },
        ].map(m => (
          <div key={m.label} className="card">
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Confidence distribution */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Confidence distribution</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'High', count: stats.confidenceAccuracy.high, color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Medium', count: stats.confidenceAccuracy.medium, color: '#ca8a04', bg: '#fefce8' },
              { label: 'Needs attention', count: stats.confidenceAccuracy.needs_attention, color: '#dc2626', bg: '#fef2f2' },
            ].map(c => {
              const total = stats.confidenceAccuracy.high + stats.confidenceAccuracy.medium + stats.confidenceAccuracy.needs_attention
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

      {/* Edit rate trend */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Edit rate over time</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading...</div>
        ) : stats.editTrend.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
            No feedback data yet. Edit rates will appear as drafts are sent.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
            {stats.editTrend.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--gray-400)' }}>{d.rate}%</div>
                <div style={{
                  width: '100%', maxWidth: 32,
                  height: `${Math.max(d.rate, 4)}px`,
                  background: d.rate > 40 ? '#fee2e2' : d.rate > 20 ? '#fef9c3' : '#dcfce7',
                  borderRadius: '4px 4px 0 0',
                  border: `1px solid ${d.rate > 40 ? '#fca5a5' : d.rate > 20 ? '#fcd34d' : '#86efac'}`,
                }} />
                <div style={{ fontSize: '0.55rem', color: 'var(--gray-400)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                  {d.date.slice(5)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
