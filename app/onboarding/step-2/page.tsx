'use client'


import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

export default function Step2Page() {
  const { user } = useAuth()
  const router = useRouter()

  async function handleContinue() {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 3 })
    router.push('/onboarding/step-3')
  }

  useEffect(() => {
    const t = setTimeout(handleContinue, 4000)
    return () => clearTimeout(t)
  })

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Carrier Connections</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        WISMO connects to shipping carriers on your behalf — no setup required.
      </p>

      <div className="card" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* UPS */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem',
            border: '1px solid var(--gray-200)',
            borderRadius: 9,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, background: '#FFB500', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: '0.85rem', color: '#0a0a0a',
              }}>
                UPS
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>UPS Tracking</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Real-time shipment tracking</div>
              </div>
            </div>
            <span className="badge-green">✓ Connected</span>
          </div>

          {/* FedEx */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem',
            border: '1px solid var(--gray-200)',
            borderRadius: 9,
            opacity: 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, background: '#4D148C', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: '0.75rem', color: 'white',
              }}>
                FedEx
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>FedEx Tracking</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Shipment tracking via FedEx</div>
              </div>
            </div>
            <span className="badge-gray">Coming soon</span>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 9, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          UPS is pre-connected using WISMO platform credentials. Your customers will see tracking data automatically pulled into responses.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => router.push('/onboarding/step-1')}
            className="btn-secondary"
            style={{ flex: '0 0 auto', justifyContent: 'center' }}
          >
            ← Back
          </button>
          <button
            onClick={handleContinue}
            className="btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Continue →
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 8 }}>
          Auto-advancing in a moment...
        </p>
      </div>
    </div>
  )
}
