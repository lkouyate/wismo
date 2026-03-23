'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase-client'

export default function Step3Page() {
  const { user } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ added: number; total: number; katanaCustomers: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleScan() {
    if (!user) return
    setStatus('scanning')
    setErrorMsg('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/customers/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setStatus('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Scan failed')
      setStatus('error')
    }
  }

  async function handleContinue() {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 4 })
    router.push('/onboarding/step-4')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Build Customer List</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        WISMO scans your Katana data to automatically identify your customers.
      </p>

      <div className="card" style={{ maxWidth: 600 }}>
        {status === 'idle' && (
          <>
            <div style={{
              padding: '1.5rem',
              background: 'var(--gray-50)',
              borderRadius: 9,
              marginBottom: 20,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Ready to scan</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                We&apos;ll import customers from Katana&apos;s customers and contacts endpoints.
              </div>
            </div>
            <button onClick={handleScan} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Scan Katana for Customers
            </button>
          </>
        )}

        {status === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid var(--gray-200)',
              borderTopColor: 'var(--black)', borderRadius: '50%',
              animation: 'spin 0.6s linear infinite', margin: '0 auto 16px',
            }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Scanning Katana...</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Importing customers and contacts</div>
          </div>
        )}

        {status === 'done' && result && (
          <>
            <div style={{ background: '#dcfce7', borderRadius: 9, padding: '1rem', marginBottom: 20 }}>
              <div style={{ color: '#166534', fontWeight: 600, marginBottom: 4 }}>✓ Scan complete</div>
              <div style={{ color: '#15803d', fontSize: '0.875rem' }}>
                {result.added} new customers added ({result.katanaCustomers} found in Katana)
              </div>
            </div>

            <div style={{ background: 'var(--gray-50)', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 20, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              <strong>Email scan:</strong> Connect Gmail in Step 4 to automatically discover customers from your inbox.
            </div>

            <button onClick={handleContinue} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Continue →
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ background: '#fee2e2', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 16 }}>
              <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>✗ {errorMsg}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleScan} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Retry
              </button>
              <button onClick={handleContinue} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                Skip for now →
              </button>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
