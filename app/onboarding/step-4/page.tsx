'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db, gmailProvider } from '@/lib/firebase-client'

export default function Step4Page() {
  const { user } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')

  async function handleConnectGmail() {
    if (!user) return
    setStatus('connecting')
    setErrorMsg('')
    try {
      const result = await signInWithPopup(auth, gmailProvider)
      // Get OAuth credential for tokens
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const accessToken = credential?.accessToken ?? ''
      const connectedEmail = result.user.email ?? ''

      const idToken = await auth.currentUser!.getIdToken()
      const res = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          accessToken,
          email: connectedEmail,
        }),
      })
      if (!res.ok) throw new Error('Failed to save Gmail connection')

      setGmailEmail(connectedEmail)
      setStatus('connected')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed')
      setStatus('error')
    }
  }

  async function handleContinue() {
    if (!user) return
    await updateDoc(doc(db, 'manufacturers', user.uid), { onboardingStep: 5 })
    router.push('/onboarding/step-5')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Connect Gmail</h1>
      <p style={{ color: 'var(--gray-500)', marginBottom: 32, fontSize: '0.9rem' }}>
        Connect your inbox so WISMO can receive and respond to customer inquiries automatically.
      </p>

      <div className="card" style={{ maxWidth: 600 }}>
        {/* Privacy disclosure */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>
            What WISMO will and won&apos;t do with Gmail access:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: '✓', color: '#166534', bg: '#dcfce7', text: 'Read incoming emails from known customers' },
              { icon: '✓', color: '#166534', bg: '#dcfce7', text: 'Send replies on your behalf (in draft or live mode)' },
              { icon: '✓', color: '#166534', bg: '#dcfce7', text: 'Identify new customer contacts from your inbox' },
              { icon: '✗', color: '#991b1b', bg: '#fee2e2', text: 'Never read personal or non-customer emails' },
              { icon: '✗', color: '#991b1b', bg: '#fee2e2', text: 'Never delete, archive or label messages' },
              { icon: '✗', color: '#991b1b', bg: '#fee2e2', text: 'Never share your data with third parties' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0.5rem 0.75rem',
                background: item.bg,
                borderRadius: 6, fontSize: '0.8rem',
              }}>
                <span style={{ color: item.color, fontWeight: 700, fontSize: '0.85rem' }}>{item.icon}</span>
                <span style={{ color: item.color }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {status === 'connected' ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#dcfce7', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 12 }}>
              <div style={{ color: '#166534', fontWeight: 600, marginBottom: 4 }}>✓ Gmail connected</div>
              <div style={{ color: '#15803d', fontSize: '0.8rem' }}>{gmailEmail}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { icon: '📬', label: 'Receive emails', desc: 'Active' },
                { icon: '📤', label: 'Send replies', desc: 'Draft mode on' },
                { icon: '👥', label: 'Customer scan', desc: 'Ready' },
                { icon: '🔔', label: 'Notifications', desc: 'Enabled' },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: '0.75rem', background: 'var(--gray-50)',
                  borderRadius: 9, fontSize: '0.8rem',
                }}>
                  <div style={{ marginBottom: 4 }}>{item.icon} {item.label}</div>
                  <div style={{ color: 'var(--gray-500)' }}>{item.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={handleContinue} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Continue →
            </button>
          </div>
        ) : (
          <>
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: 9,
              padding: '0.75rem 1rem',
              marginBottom: 16,
              fontSize: '0.8rem',
              color: '#92400e',
            }}>
              <strong>Note:</strong> Google will show a warning screen because WISMO is not yet verified by Google. Click &quot;Advanced&quot; → &quot;Continue to WISMO&quot; to proceed. This is expected for new apps.
            </div>
            <button
              onClick={handleConnectGmail}
              disabled={status === 'connecting'}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
            >
              {status === 'connecting' ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Connect Gmail
                </>
              )}
            </button>

            {status === 'error' && (
              <div style={{ background: '#fee2e2', borderRadius: 9, padding: '0.75rem', marginBottom: 12 }}>
                <div style={{ color: '#991b1b', fontSize: '0.8rem' }}>✗ {errorMsg}</div>
              </div>
            )}

            <button onClick={handleContinue} className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              Skip for now
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
