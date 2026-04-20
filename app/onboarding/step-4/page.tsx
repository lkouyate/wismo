'use client'


import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase-client'

function Step4Inner() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')

  // Handle OAuth2 callback params
  useEffect(() => {
    const connected = searchParams.get('connected')
    const email = searchParams.get('email')
    const error = searchParams.get('error')

    if (connected === 'true') {
      setGmailEmail(decodeURIComponent(email ?? ''))
      setStatus('connected')
    } else if (error) {
      setErrorMsg(decodeURIComponent(error))
      setStatus('error')
    }
  }, [searchParams])

  async function handleConnectGmail() {
    if (!user) return
    setStatus('connecting')
    setErrorMsg('')
    try {
      const idToken = await auth.currentUser!.getIdToken()
      // Redirect to server-side OAuth2 flow (gets real refresh token)
      window.location.href = `/api/gmail/auth?idToken=${encodeURIComponent(idToken)}`
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
        {/* Privacy disclosure — don'ts first per PRD §9.1 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>What WISMO will never do</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 10 }}>Reassurance first.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {[
              'Read emails from unknown senders — if the sender\'s domain is not on your customer list, WISMO ignores the email completely',
              'Send emails on your behalf without your explicit configuration',
              'Store your email content — emails are read in memory and discarded immediately after processing',
              'Access any folder other than your inbox — not sent items, drafts, archived email, or any labels',
            ].map((text, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '0.5rem 0.75rem',
                background: '#fee2e2',
                borderRadius: 6, fontSize: '0.8rem',
              }}>
                <span style={{ color: '#991b1b', fontWeight: 700, flexShrink: 0 }}>✗</span>
                <span style={{ color: '#991b1b' }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>What WISMO does do</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Watch for new emails from known customer domains',
              'Read the subject line and email body to find PO numbers and understand the query',
              'Scan the thread history to find PO numbers mentioned in earlier messages',
            ].map((text, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '0.5rem 0.75rem',
                background: '#dcfce7',
                borderRadius: 6, fontSize: '0.8rem',
              }}>
                <span style={{ color: '#166534', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ color: '#166534' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {status === 'connected' ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#dcfce7', borderRadius: 9, padding: '0.75rem 1rem', marginBottom: 16 }}>
              <div style={{ color: '#166534', fontWeight: 600, marginBottom: 4 }}>✓ Gmail connected</div>
              <div style={{ color: '#15803d', fontSize: '0.8rem' }}>{gmailEmail}</div>
            </div>

            {/* Post-connection confirmation — don'ts lead per PRD §9.3 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { icon: '✗', label: 'Never stores email content', color: '#991b1b', bg: '#fee2e2' },
                { icon: '✗', label: 'Never accesses other folders', color: '#991b1b', bg: '#fee2e2' },
                { icon: '✓', label: 'Monitors known customer domains', color: '#166534', bg: '#dcfce7' },
                { icon: '✓', label: 'Reads subject line and email body only', color: '#166534', bg: '#dcfce7' },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: '0.75rem', background: item.bg,
                  borderRadius: 9, fontSize: '0.75rem', color: item.color,
                  display: 'flex', gap: 6, alignItems: 'flex-start',
                }}>
                  <span style={{ fontWeight: 700, flexShrink: 0 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <button onClick={handleContinue} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
              Continue →
            </button>
            <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', textAlign: 'center' }}>
              You can disconnect at any time from Settings → Channels
            </p>
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
              <strong>Heads up:</strong> The Google screen you&apos;ll see next says &quot;Read all your email messages&quot; — that&apos;s Google&apos;s standard wording for any email integration. In practice, WISMO only reads emails from your known customer domains, in your inbox only.
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
                  Redirecting to Google...
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

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/onboarding/step-3')} className="btn-secondary" style={{ justifyContent: 'center' }}>
                ← Back
              </button>
              <button onClick={handleContinue} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                Skip for now
              </button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', textAlign: 'center', marginTop: 8 }}>
              You can connect Gmail at any time from Settings → Channels
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function Step4Page() {
  return (
    <Suspense>
      <Step4Inner />
    </Suspense>
  )
}
