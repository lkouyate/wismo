'use client'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { auth } from '@/lib/firebase-client'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

export default function Step1Page() {
  const { user } = useAuth()
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [masked, setMasked] = useState(true)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ orderCount: number; customerCount: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleTest() {
    if (!apiKey.trim() || !user) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/katana/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), idToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Connection failed')
      setResult(data)
      setStatus('success')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed')
      setStatus('error')
    }
  }

  async function handleContinue() {
    if (!user || status !== 'success') return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 2 })
    router.push('/onboarding/step-2')
  }

  async function handleSkip() {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 2 })
    router.push('/onboarding/step-2')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Connect Katana</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        Link your Katana OMS so WISMO can look up order status and tracking information.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left panel: API key form */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Your API Key</h2>

          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 6, color: 'var(--gray-600)' }}>
            Katana API Key
          </label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              type={masked ? 'password' : 'text'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setStatus('idle') }}
              placeholder="kat_..."
              className="input-field"
              style={{ paddingRight: 40 }}
            />
            <button
              onClick={() => setMasked(!masked)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)',
                fontSize: '0.75rem',
              }}
            >
              {masked ? 'Show' : 'Hide'}
            </button>
          </div>

          <button
            onClick={handleTest}
            disabled={!apiKey.trim() || status === 'loading'}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
          >
            {status === 'loading' ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
                Testing connection...
              </>
            ) : 'Test Connection'}
          </button>

          {status === 'success' && result && (
            <div style={{ background: '#dcfce7', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 12 }}>
              <div style={{ color: '#166534', fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>
                ✓ Connected successfully
              </div>
              <div style={{ color: '#15803d', fontSize: '0.8rem' }}>
                Found {result.orderCount} orders · {result.customerCount} customers
              </div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ background: '#fee2e2', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 12 }}>
              <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>✗ {errorMsg}</div>
            </div>
          )}

          <button
            onClick={handleContinue}
            disabled={status !== 'success'}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', opacity: status !== 'success' ? 0.4 : 1, marginBottom: 8 }}
          >
            Continue →
          </button>

          <button
            onClick={handleSkip}
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}
          >
            Skip for now (testing only)
          </button>
        </div>

        {/* Right panel: Guide */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>
            How to find your API key
          </h2>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Log into your Katana account at app.katanamrp.com',
              'Go to Settings → Integrations → API',
              'Click "Generate API key" or copy an existing one',
            ].map((step, i) => (
              <li key={i} style={{ fontSize: '0.875rem', color: 'var(--gray-600)', lineHeight: 1.5 }}>
                {step}
              </li>
            ))}
          </ol>

          {/* Placeholder screenshot */}
          <div style={{
            marginTop: 20,
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 9,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gray-400)',
            fontSize: '0.8rem',
          }}>
            📸 Katana Settings → API screenshot
          </div>

          <div style={{ marginTop: 16, padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 9, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            <strong>Your data stays private.</strong> WISMO only reads order and customer data. We never modify your Katana records.
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
