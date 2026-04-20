'use client'


import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

interface CronLast {
  job?: string
  ranAt?: { seconds: number }
  succeeded?: number
  failed?: number
  triggeredBy?: string
  adminEmail?: string
}

interface WebhookLast {
  lastDelivery?: { seconds: number }
  deliveryCount?: number
}

interface DayStat {
  date: string
  anthropic: number
  ups: number
  katana: number
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000)
    return d.toISOString().slice(0, 10)
  }).reverse()
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}

export default function AdminInfrastructurePage() {
  const [cronLast, setCronLast] = useState<CronLast | null>(null)
  const [webhookLast, setWebhookLast] = useState<WebhookLast | null>(null)
  const [usageStats, setUsageStats] = useState<DayStat[]>([])
  const [cronRunning, setCronRunning] = useState(false)
  const [cronResult, setCronResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const days = last7Days()

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'systemStatus', 'cronLast')),
      getDoc(doc(db, 'systemStatus', 'webhookLast')),
      ...days.map(d => getDoc(doc(db, 'systemStats', d))),
    ]).then(([cronSnap, webhookSnap, ...statSnaps]) => {
      if (cronSnap.exists()) setCronLast(cronSnap.data() as CronLast)
      if (webhookSnap.exists()) setWebhookLast(webhookSnap.data() as WebhookLast)
      setUsageStats(statSnaps.map((snap, i) => ({
        date: days[i],
        anthropic: snap.exists() ? (snap.data()?.anthropic ?? 0) : 0,
        ups: snap.exists() ? (snap.data()?.ups ?? 0) : 0,
        katana: snap.exists() ? (snap.data()?.katana ?? 0) : 0,
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function runCron() {
    if (!auth?.currentUser) return
    setCronRunning(true)
    setCronResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/admin/run-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ job: 'renew-gmail-watch' }),
      })
      const data = await res.json()
      if (data.error) {
        setCronResult(`Error: ${data.error}`)
      } else {
        setCronResult(`Done — ${data.succeeded} renewed, ${data.failed} failed`)
        // Refresh cron status
        const snap = await getDoc(doc(db, 'systemStatus', 'cronLast'))
        if (snap.exists()) setCronLast(snap.data() as CronLast)
      }
    } catch (err) {
      setCronResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setCronRunning(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#737373', fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #e5e5e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const webhookAgeMs = webhookLast?.lastDelivery
    ? Date.now() - webhookLast.lastDelivery.seconds * 1000
    : null
  const webhookAgeHours = webhookAgeMs ? Math.floor(webhookAgeMs / 3600000) : null

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Infrastructure</h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: 4 }}>Webhook health, Gmail watch renewal, and API usage monitoring.</p>
      </div>

      {/* Pub/Sub webhook health */}
      <Section title="Pub/Sub Webhook Health">
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Webhook endpoint</div>
            <code style={{ fontSize: 12, background: '#f3f4f6', padding: '3px 8px', borderRadius: 5 }}>
              {process.env.NEXT_PUBLIC_APP_URL ?? 'https://wismo-dashboard.vercel.app'}/api/gmail/webhook
            </code>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Pub/Sub topic</div>
            <code style={{ fontSize: 12, background: '#f3f4f6', padding: '3px 8px', borderRadius: 5 }}>
              projects/wismo-490722/topics/gmail-push
            </code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 16px', minWidth: 160 }}>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Last delivery</div>
            {webhookLast?.lastDelivery ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: webhookAgeHours !== null && webhookAgeHours > 48 ? '#991b1b' : '#166534' }}>
                  {new Date(webhookLast.lastDelivery.seconds * 1000).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#737373', marginTop: 2 }}>
                  {webhookAgeHours !== null && webhookAgeHours < 24 ? `${webhookAgeHours}h ago` : webhookAgeHours !== null ? `${Math.floor(webhookAgeHours / 24)}d ago` : ''}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#a3a3a3' }}>No deliveries yet</div>
            )}
          </div>
          <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total deliveries</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{webhookLast?.deliveryCount ?? 0}</div>
          </div>
        </div>
      </Section>

      {/* Gmail watch cron */}
      <Section title="Gmail Watch Auto-Renewal (Cron)">
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#737373', marginBottom: 12 }}>
              Vercel cron runs <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>0 0 */6 * *</code> (every 6 days). Gmail watches expire after 7 days.
            </div>
            {cronLast ? (
              <div style={{ fontSize: 12 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#737373' }}>Last run: </span>
                  <strong>{cronLast.ranAt ? new Date(cronLast.ranAt.seconds * 1000).toLocaleString() : '—'}</strong>
                  {cronLast.triggeredBy === 'admin' && <span style={{ marginLeft: 6, fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 9999 }}>manual</span>}
                </div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#166534' }}>✓ {cronLast.succeeded ?? 0} renewed</span>
                  {(cronLast.failed ?? 0) > 0 && <span style={{ color: '#991b1b', marginLeft: 12 }}>✗ {cronLast.failed} failed</span>}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#a3a3a3' }}>Cron has not run yet.</div>
            )}
            {cronResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: cronResult.startsWith('Error') ? '#991b1b' : '#166534' }}>{cronResult}</div>
            )}
          </div>
          <button
            onClick={runCron}
            disabled={cronRunning}
            style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, background: '#0a0a0a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}
          >
            {cronRunning ? 'Running…' : 'Run now'}
          </button>
        </div>
      </Section>

      {/* API usage */}
      <Section title="API Usage (Last 7 Days)">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Anthropic', 'Katana', 'UPS', 'Total'].map(h => (
                <th key={h} style={{ padding: '6px 12px', textAlign: h === 'Date' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: '#525252', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usageStats.map(row => {
              const total = row.anthropic + row.ups + row.katana
              return (
                <tr key={row.date} style={{ borderTop: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.date}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', color: row.anthropic > 0 ? '#6d28d9' : '#d1d5db' }}>{row.anthropic}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', color: row.katana > 0 ? '#0891b2' : '#d1d5db' }}>{row.katana}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', color: row.ups > 0 ? '#0369a1' : '#d1d5db' }}>{row.ups}</td>
                  <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{total || <span style={{ color: '#d1d5db' }}>0</span>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #e5e5e5' }}>
              <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>7-day total</td>
              {(['anthropic', 'ups', 'katana'] as const).map(key => (
                <td key={key} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                  {usageStats.reduce((s, r) => s + (key === 'ups' ? r.ups : key === 'katana' ? r.katana : r.anthropic), 0)}
                </td>
              ))}
              <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                {usageStats.reduce((s, r) => s + r.anthropic + r.ups + r.katana, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Section>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
