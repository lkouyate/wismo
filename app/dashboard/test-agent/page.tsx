'use client'


import { useState } from 'react'
import { auth } from '@/lib/firebase-client'

interface RunResult {
  response?: string
  confidence?: string
  dataSources?: string[]
  poNumber?: string | null
  error?: string
}

export default function TestAgentPage() {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  async function runTest() {
    if (!message.trim() || !auth.currentUser) return
    setLoading(true)
    setResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          mode: 'test',
          customerEmail: email.trim() || undefined,
          customerCompany: company.trim() || undefined,
          customerMessage: message.trim(),
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Test Agent</h1>
        <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', marginTop: 4 }}>
          Run the AI pipeline with a sample customer email. Results are not saved and do not count toward your usage.
        </p>
      </div>

      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              Customer email
            </label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="customer@example.com"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--gray-200)', borderRadius: 8, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              Company name
            </label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Corp"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--gray-200)', borderRadius: 8, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            Customer message
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Hi, I'd like to check on the status of my order PO-1234. When will it ship?"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--gray-200)', borderRadius: 8, minHeight: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        <button
          onClick={runTest}
          disabled={loading || !message.trim()}
          style={{
            padding: '8px 20px', background: 'var(--black)', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: message.trim() && !loading ? 'pointer' : 'not-allowed',
            opacity: message.trim() && !loading ? 1 : 0.5,
          }}
        >
          {loading ? 'Running…' : 'Run Test'}
        </button>
      </div>

      {result && (
        <div style={{ background: 'white', border: `1px solid ${result.error ? '#fca5a5' : 'var(--gray-200)'}`, borderRadius: 12, padding: '20px 24px' }}>
          {result.error ? (
            <p style={{ color: '#991b1b', fontSize: 13, margin: 0 }}>Error: {result.error}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</span>
                {result.confidence && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#dbeafe', color: '#1e40af', fontWeight: 500 }}>
                    {result.confidence}
                  </span>
                )}
                {result.poNumber && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'var(--gray-100)', color: 'var(--gray-600)', fontWeight: 500 }}>
                    PO: {result.poNumber}
                  </span>
                )}
                {(result.dataSources ?? []).map(s => (
                  <span key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: '#dcfce7', color: '#166534', fontWeight: 500 }}>
                    {s}
                  </span>
                ))}
              </div>
              <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--black)', fontFamily: 'inherit', lineHeight: 1.6 }}>
                {result.response}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
