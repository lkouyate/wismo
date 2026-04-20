'use client'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup } from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase-client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleGoogleSignIn() {
    setLoading(true)
    setError('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const { user } = result

      const manufacturerRef = doc(db, 'manufacturers', user.uid)
      const snap = await getDoc(manufacturerRef)

      if (!snap.exists()) {
        await setDoc(manufacturerRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          katanaConnected: false,
          upsConnected: true,
          gmailConnected: false,
          onboardingStep: 1,
          onboardingComplete: false,
          isLive: false,
          draftMode: true,
          plan: 'free_trial',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          queriesThisMonth: 0,
          queriesTotal: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }

      // Set server-side session cookie for middleware route protection
      const idToken = await user.getIdToken()
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      router.replace('/dashboard')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--gray-50)',
    }}>
      <div style={{
        background: 'var(--white)',
        border: '1px solid var(--gray-200)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: 400,
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <img src="/wismo-logo.svg" alt="WISMO" style={{ height: 'clamp(36px, 5vw, 52px)', width: 'auto', maxWidth: '220px' }} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, color: 'var(--black)' }}>
          Welcome back
        </h1>
        <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: 32 }}>
          Sign in to your WISMO dashboard
        </p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '0.75rem 1.25rem',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--border-radius)',
            background: loading ? 'var(--gray-50)' : 'var(--white)',
            color: 'var(--black)',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading ? (
            <span style={{
              width: 18, height: 18, border: '2px solid #e5e5e5',
              borderTopColor: '#0a0a0a', borderRadius: '50%',
              display: 'inline-block', animation: 'spin 0.6s linear infinite',
            }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {error && (
          <p style={{ color: '#991b1b', fontSize: '0.8rem', marginTop: 12 }}>{error}</p>
        )}

        <p style={{ color: 'var(--gray-400)', fontSize: '0.75rem', marginTop: 24, lineHeight: 1.5 }}>
          By signing in, you agree to WISMO&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
