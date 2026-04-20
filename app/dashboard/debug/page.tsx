'use client'


import { useState } from 'react'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { auth } from '@/lib/firebase-client'

export default function DebugPage() {
  const { user } = useAuth()
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function testPipeline() {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          mode: 'test',
          customerMessage: 'Hi, can you give me a status update on my recent order? When will it ship?',
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function simulatePubSub() {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      // First get the stored historyId from the status check
      const idToken = await auth.currentUser!.getIdToken()
      const statusRes = await fetch('/api/debug/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const statusData = await statusRes.json()
      const historyId = statusData?.status?.gmailHistoryId
      const gmailEmail = statusData?.status?.gmailEmail

      if (!historyId || historyId === 'NOT SET') {
        throw new Error('No gmailHistoryId in Firestore. Gmail watch may not be registered.')
      }

      // Build a Pub/Sub-style payload and send directly to webhook
      const pubsubData = Buffer.from(JSON.stringify({ emailAddress: gmailEmail, historyId })).toString('base64')
      const res = await fetch('/api/gmail/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'wismo-test-secret-2026'}`,
        },
        body: JSON.stringify({ message: { data: pubsubData, attributes: { emailAddress: gmailEmail } } }),
      })
      const data = await res.json()
      setResult({ simulatePubSub: true, historyId, gmailEmail, webhookResponse: data, httpStatus: res.status })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function runCheck() {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/debug/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const issues: string[] = (result as any)?.issues ?? []
  const status: Record<string, unknown> = (result as any)?.status ?? {}
  const ready: boolean = (result as any)?.ready ?? false

  return (
    <div style={{ padding: '2rem', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Path B — Pipeline Status Check</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: 24 }}>
        Verifies every prerequisite for the full Gmail → Pub/Sub → Webhook → Claude pipeline.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={runCheck} disabled={loading} className="btn-primary">
          {loading ? 'Checking...' : 'Run Status Check'}
        </button>
        <button onClick={testPipeline} disabled={loading} className="btn-secondary">
          {loading ? 'Running...' : 'Test Agent Pipeline'}
        </button>
        <button onClick={simulatePubSub} disabled={loading} style={{
          padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
          background: '#7c3aed', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Simulating...' : 'Simulate Pub/Sub → Webhook'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: 9, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && !('status' in result) && (
        <div style={{ background: '#0a0a0a', color: '#86efac', padding: '1.25rem', borderRadius: 10, marginBottom: 24, fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(result, null, 2)}
        </div>
      )}

      {result && ('status' in result) && (
        <>
          {/* Overall status */}
          <div style={{
            padding: '1rem 1.25rem',
            borderRadius: 10,
            marginBottom: 20,
            background: ready ? '#dcfce7' : '#fff7ed',
            border: `1px solid ${ready ? '#86efac' : '#fed7aa'}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: ready ? '#166534' : '#9a3412' }}>
              {ready ? '✓ All systems ready — pipeline should be live' : `⚠ ${issues.length} issue${issues.length !== 1 ? 's' : ''} found`}
            </div>
            {issues.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                {issues.map((issue, i) => (
                  <li key={i} style={{ fontSize: '0.85rem', color: '#9a3412', marginBottom: 4 }}>{issue}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Status rows */}
          {[
            { section: 'Agent', rows: [
              { key: 'isLive', label: 'isLive', value: status.isLive },
              { key: 'draftMode', label: 'Draft Mode', value: status.draftMode },
            ]},
            { section: 'Katana', rows: [
              { key: 'katanaConnected', label: 'Connected', value: status.katanaConnected },
              { key: 'katanaApiKey', label: 'API Key', value: status.katanaApiKey },
            ]},
            { section: 'Gmail', rows: [
              { key: 'gmailConnected', label: 'Connected', value: status.gmailConnected },
              { key: 'gmailEmail', label: 'Email', value: status.gmailEmail },
              { key: 'gmailAccessToken', label: 'Access Token', value: status.gmailAccessToken },
              { key: 'gmailRefreshToken', label: 'Refresh Token', value: status.gmailRefreshToken },
              { key: 'gmailWatchStatus', label: 'Watch Status', value: status.gmailWatchStatus },
              { key: 'gmailWatchExpiry', label: 'Watch Expiry', value: status.gmailWatchExpiry },
            ]},
            { section: 'Customers', rows: [
              { key: 'activeCustomerCount', label: 'Active Customers', value: status.activeCustomerCount },
              { key: 'customerDomains', label: 'Domains', value: Array.isArray(status.customerDomains) ? (status.customerDomains as string[]).join(', ') || 'none' : status.customerDomains },
            ]},
            { section: 'Env Vars', rows: Object.entries((status.envChecks as Record<string,unknown>) ?? {}).map(([k, v]) => ({ key: k, label: k, value: v })) },
          ].map(({ section, rows }) => (
            <div key={section} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-400)', marginBottom: 6 }}>{section}</div>
              <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                {rows.map(({ key, label, value }, i) => {
                  const isOk = value === true || (typeof value === 'string' && value !== 'NOT SET' && !value.startsWith('EXPIR') && !value.startsWith('NOT'))
                  const isWarn = typeof value === 'string' && (value.startsWith('EXPIR') || value.startsWith('NOT'))
                  return (
                    <div key={key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 1rem',
                      borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)',
                    }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>{label}</span>
                      <span style={{
                        fontSize: '0.8rem', fontWeight: 600,
                        color: value === false ? '#991b1b' : isWarn ? '#92400e' : isOk ? '#166534' : 'var(--gray-700)',
                      }}>
                        {String(value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
