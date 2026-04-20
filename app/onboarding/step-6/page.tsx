'use client'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'

export default function Step6Page() {
  const { user } = useAuth()
  const router = useRouter()
  const [draftMode, setDraftMode] = useState(true)
  const [loading, setLoading] = useState(false)

  async function handleGoLive() {
    if (!user) return
    setLoading(true)
    await updateDoc(doc(db, 'manufacturers', user.uid), {
      isLive: true,
      draftMode,
      onboardingStep: 6,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    router.push('/dashboard/drafts')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Go Live</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        You&apos;re almost there. Choose how WISMO should handle customer responses.
      </p>

      <div className="card" style={{ maxWidth: 600 }}>
        {/* Mode selector */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, fontSize: '0.9rem' }}>Response Mode</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setDraftMode(true)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '1rem', borderRadius: 9, cursor: 'pointer',
                border: `2px solid ${draftMode ? 'var(--black)' : 'var(--gray-200)'}`,
                background: draftMode ? 'var(--gray-50)' : 'var(--white)',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                border: `2px solid ${draftMode ? 'var(--black)' : 'var(--gray-300)'}`,
                background: draftMode ? 'var(--black)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {draftMode && <div style={{ width: 6, height: 6, background: 'white', borderRadius: '50%' }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Draft Mode (Recommended)</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 4 }}>
                  Agent composes responses but holds them for your review. You approve, edit, or discard before anything is sent. Turn it off whenever you feel confident.
                </div>
              </div>
            </button>

            <button
              onClick={() => setDraftMode(false)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '1rem', borderRadius: 9, cursor: 'pointer',
                border: `2px solid ${!draftMode ? 'var(--black)' : 'var(--gray-200)'}`,
                background: !draftMode ? 'var(--gray-50)' : 'var(--white)',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                border: `2px solid ${!draftMode ? 'var(--black)' : 'var(--gray-300)'}`,
                background: !draftMode ? 'var(--black)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!draftMode && <div style={{ width: 6, height: 6, background: 'white', borderRadius: '50%' }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-send Mode</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 4 }}>
                  The agent will respond automatically within 10 minutes of receiving an email. Escalations are still routed to your team.
                </div>
              </div>
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--gray-50)', borderRadius: 9, padding: '0.875rem 1rem', marginBottom: 20, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          You can change this anytime in <strong>Settings → Channels</strong>.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => router.push('/onboarding/step-5')}
            disabled={loading}
            className="btn-secondary"
            style={{ justifyContent: 'center' }}
          >
            ← Back
          </button>
          <button
            onClick={handleGoLive}
            disabled={loading}
            className="btn-primary"
            style={{ flex: 1, justifyContent: 'center', fontSize: '1rem', padding: '0.75rem' }}
          >
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
                Activating...
              </>
            ) : '🚀 Go Live'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
