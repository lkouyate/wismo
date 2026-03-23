'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

interface AgentResult {
  response: string
  confidence: 'high' | 'medium' | 'needs_attention'
  dataSources: string[]
  poNumber?: string
  trackingData?: { status: string; estimatedDelivery?: string }
  orderData?: Record<string, unknown>
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'High confidence', color: '#166534' },
  medium: { label: 'Medium confidence', color: '#92400e' },
  needs_attention: { label: 'Needs attention', color: '#991b1b' },
}

export default function Step5Page() {
  const { user } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AgentResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleTest() {
    if (!user) return
    setStatus('running')
    setErrorMsg('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'test' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Agent run failed')
      setResult(data)
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Test failed')
      setStatus('error')
    }
  }

  async function handleContinue() {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 6 })
    router.push('/onboarding/step-6')
  }

  const conf = result ? CONFIDENCE_LABELS[result.confidence] : null

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Test Your Agent</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        Let&apos;s run a test query using your most recent Katana order to see WISMO in action.
      </p>

      <div style={{ maxWidth: 640 }}>
        {status === 'idle' && (
          <div className="card">
            <div style={{
              padding: '1.5rem',
              background: 'var(--gray-50)',
              borderRadius: 9,
              marginBottom: 20,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🤖</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Ready to test</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                WISMO will pull your most recent Katana order, check UPS tracking, and generate a sample response.
              </div>
            </div>
            <button onClick={handleTest} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Run Test Query
            </button>
          </div>
        )}

        {status === 'running' && (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid var(--gray-200)',
              borderTopColor: 'var(--black)', borderRadius: '50%',
              animation: 'spin 0.6s linear infinite', margin: '0 auto 16px',
            }} />
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Running agent pipeline...</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>1. Fetching order from Katana</div>
              <div>2. Checking UPS tracking</div>
              <div>3. Generating response with Claude</div>
            </div>
          </div>
        )}

        {status === 'done' && result && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>Agent Response Preview</div>
              {conf && (
                <span style={{
                  background: conf.color === '#166534' ? '#dcfce7' : conf.color === '#92400e' ? '#fef9c3' : '#fee2e2',
                  color: conf.color,
                  padding: '0.25rem 0.625rem',
                  borderRadius: 9999,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}>
                  {conf.label}
                </span>
              )}
            </div>

            {/* Data sources */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {result.dataSources.map((src) => (
                <span key={src} className="badge-gray">{src.toUpperCase()}</span>
              ))}
              {result.dataSources.length === 0 && (
                <span className="badge-yellow">No data sources</span>
              )}
            </div>

            {/* Response text */}
            <div style={{
              background: 'var(--gray-50)',
              borderRadius: 9,
              padding: '1rem',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              color: 'var(--gray-600)',
              whiteSpace: 'pre-wrap',
              marginBottom: 20,
            }}>
              {result.response}
            </div>

            {result.poNumber && (
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 16 }}>
                PO: {result.poNumber}
                {result.trackingData && ` · Tracking: ${result.trackingData.status}`}
              </div>
            )}

            <button onClick={handleContinue} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Looks good — Continue →
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="card">
            <div style={{ background: '#fee2e2', borderRadius: 9, padding: '0.75rem', marginBottom: 16 }}>
              <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>✗ {errorMsg}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleTest} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Retry
              </button>
              <button onClick={handleContinue} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                Skip →
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
