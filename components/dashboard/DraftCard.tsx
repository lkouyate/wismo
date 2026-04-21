'use client'

import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'

const FEEDBACK_REASONS = [
  { key: 'tone', label: 'Wrong tone' },
  { key: 'accuracy', label: 'Inaccurate info' },
  { key: 'missing_info', label: 'Missing details' },
  { key: 'too_long', label: 'Too long' },
  { key: 'too_short', label: 'Too short' },
  { key: 'other', label: 'Other' },
] as const

interface DraftCardProps {
  id: string
  customerEmail: string
  customerCompany: string
  customerMessage: string
  agentResponse: string
  confidence: 'high' | 'medium' | 'needs_attention'
  dataSources: string[]
  slaDeadline: Timestamp
  onSend: (id: string, response: string, feedback?: { rating: string; reasons: string[] }) => Promise<void>
  onDiscard: (id: string) => Promise<void>
}

export function DraftCard({
  id,
  customerEmail,
  customerCompany,
  customerMessage,
  agentResponse,
  confidence,
  dataSources,
  slaDeadline,
  onSend,
  onDiscard,
}: DraftCardProps) {
  const [response, setResponse] = useState(agentResponse)
  const [expanded, setExpanded] = useState(false)
  const [sending, setSending] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [showReasons, setShowReasons] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const deadline = slaDeadline?.toDate?.()
  const minsLeft = deadline ? Math.round((deadline.getTime() - now.getTime()) / 60000) : null
  const slaWarning = minsLeft !== null && minsLeft < 10
  const slaAlert = minsLeft !== null && minsLeft < 5

  const confColors = {
    high: { bg: '#dcfce7', color: '#166534' },
    medium: { bg: '#fef9c3', color: '#92400e' },
    needs_attention: { bg: '#fee2e2', color: '#991b1b' },
  }[confidence]

  function handleRating(r: 'positive' | 'negative') {
    setRating(r)
    if (r === 'negative') {
      setShowReasons(true)
    } else {
      setShowReasons(false)
      setSelectedReasons([])
    }
  }

  function toggleReason(key: string) {
    setSelectedReasons(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function handleSend() {
    setSending(true)
    const feedback = rating ? { rating, reasons: selectedReasons } : undefined
    await onSend(id, response, feedback)
  }

  return (
    <div style={{
      background: 'var(--white)',
      border: `1px solid ${slaAlert ? '#fca5a5' : slaWarning ? '#fcd34d' : 'var(--gray-200)'}`,
      borderRadius: 'var(--border-radius-lg)',
      padding: '1.25rem',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{customerCompany}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{customerEmail}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dataSources.map((src) => (
            <span key={src} className="badge-gray">{src.toUpperCase()}</span>
          ))}
          <span style={{ ...confColors, padding: '0.25rem 0.625rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 500 }}>
            {confidence.replace('_', ' ')}
          </span>
          {minsLeft !== null && (
            <span style={{
              fontSize: '0.75rem',
              color: slaAlert ? '#991b1b' : slaWarning ? '#92400e' : 'var(--gray-400)',
              fontWeight: slaWarning ? 600 : 400,
            }}>
              {slaAlert ? '\u26a0 ' : ''}{minsLeft}m left
            </span>
          )}
        </div>
      </div>

      {/* Customer message (collapsible) */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'var(--gray-50)',
          borderRadius: 9,
          padding: '0.625rem 0.875rem',
          marginBottom: 12,
          fontSize: '0.8rem',
          color: 'var(--gray-600)',
          cursor: 'pointer',
          maxHeight: expanded ? 'none' : 60,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginBottom: 4 }}>
          CUSTOMER MESSAGE {expanded ? '\u25b2' : '\u25bc'}
        </div>
        {customerMessage}
      </div>

      {/* Editable response */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginBottom: 6 }}>
          AGENT RESPONSE
        </div>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          style={{
            width: '100%',
            minHeight: 120,
            padding: '0.75rem',
            border: '1px solid var(--gray-200)',
            borderRadius: 9,
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            color: 'var(--black)',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* Feedback: thumbs up/down */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', marginBottom: 6 }}>
          RATE THIS RESPONSE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => handleRating('positive')}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: 8,
              border: `1px solid ${rating === 'positive' ? '#16a34a' : 'var(--gray-200)'}`,
              background: rating === 'positive' ? '#f0fdf4' : 'var(--white)',
              color: rating === 'positive' ? '#16a34a' : 'var(--gray-500)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: rating === 'positive' ? 600 : 400,
            }}
          >
            Good
          </button>
          <button
            onClick={() => handleRating('negative')}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: 8,
              border: `1px solid ${rating === 'negative' ? '#dc2626' : 'var(--gray-200)'}`,
              background: rating === 'negative' ? '#fef2f2' : 'var(--white)',
              color: rating === 'negative' ? '#dc2626' : 'var(--gray-500)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: rating === 'negative' ? 600 : 400,
            }}
          >
            Needs work
          </button>
          {rating && (
            <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginLeft: 4 }}>
              {rating === 'positive' ? 'Thanks for the feedback!' : 'Select reasons below'}
            </span>
          )}
        </div>

        {/* Reason chips (shown on negative) */}
        {showReasons && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {FEEDBACK_REASONS.map(r => {
              const active = selectedReasons.includes(r.key)
              return (
                <button
                  key={r.key}
                  onClick={() => toggleReason(r.key)}
                  style={{
                    padding: '0.3rem 0.625rem',
                    borderRadius: 9999,
                    border: `1px solid ${active ? '#6366f1' : 'var(--gray-200)'}`,
                    background: active ? '#eef2ff' : 'var(--white)',
                    color: active ? '#4338ca' : 'var(--gray-500)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSend}
          disabled={sending}
          className="btn-primary"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button
          onClick={() => onDiscard(id)}
          className="btn-secondary"
          style={{ padding: '0.625rem 1rem' }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
