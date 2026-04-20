'use client'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase-client'

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSignIn() {
    setLoading(true)
    setError('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const { user } = result

      // Set server-side session cookie (required by middleware)
      const idToken = await user.getIdToken()
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      // Attempt to set the wismo_admin claim if email matches WISMO_ADMIN_EMAIL
      const res = await fetch('/api/admin/set-claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })

      if (!res.ok) {
        await signOut(auth)
        setError('This Google account is not authorized as a WISMO admin.')
        return
      }

      // Force token refresh so the new claim is included
      await user.getIdToken(true)
      const tokenResult = await user.getIdTokenResult()

      if (!tokenResult.claims.wismo_admin) {
        await signOut(auth)
        setError('Claim was not set. Check WISMO_ADMIN_EMAIL environment variable.')
        return
      }

      router.replace('/admin/manufacturers')
    } catch (err) {
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
      background: '#0a0a0a',
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 16,
        padding: '2.5rem',
        width: '100%',
        maxWidth: 380,
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: 32 }}>
          <img src="/wismo-logo.svg" alt="WISMO" style={{ height: 'clamp(34px, 4vw, 44px)', width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 6, color: 'white' }}>
          Internal access only
        </h1>
        <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: 28 }}>
          Sign in with the authorized WISMO admin Google account.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '0.75rem 1rem',
            border: '1px solid #333',
            borderRadius: 10,
            background: loading ? '#111' : '#222',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <span style={{ width: 16, height: 16, border: '2px solid #444', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Authenticating...' : 'Sign in with Google'}
        </button>

        {error && (
          <div style={{ marginTop: 16, padding: '0.75rem', background: '#1f0000', border: '1px solid #7f1d1d', borderRadius: 8 }}>
            <p style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{error}</p>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
