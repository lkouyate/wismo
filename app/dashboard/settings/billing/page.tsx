'use client'


import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/FirebaseProvider'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase-client'
import { getTrialDaysLeft } from '@/lib/billing-shared'
import { Timestamp } from 'firebase/firestore'
import Link from 'next/link'

interface BillingData {
  plan?: string
  trialEndsAt?: Timestamp
  subscriptionStatus?: string
  currentPeriodEnd?: Timestamp
  cancelAtPeriodEnd?: boolean
  stripeCustomerId?: string
  queriesThisMonth?: number
  queriesTotal?: number
  billingEmail?: string
}

const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  core: 'Core',
  enhanced: 'Enhanced',
  full: 'Full',
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#dcfce7', color: '#166534' },
  trialing:  { bg: '#dbeafe', color: '#1e40af' },
  past_due:  { bg: '#fef9c3', color: '#92400e' },
  canceled:  { bg: '#fee2e2', color: '#991b1b' },
  unpaid:    { bg: '#fee2e2', color: '#991b1b' },
}

export default function BillingPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const justUpgraded = searchParams?.get('success') === '1'

  const [billing, setBilling] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'manufacturers', user.uid)).then(snap => {
      if (snap.exists()) setBilling(snap.data() as BillingData)
      setLoading(false)
    })
  }, [user])

  async function handleUpgrade(plan: 'core' | 'enhanced' | 'full') {
    if (!user) return
    setCheckoutLoading(plan)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    if (!user) return
    setPortalLoading(true)
    setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open portal')
      setPortalLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--gray-400)' }}>Loading…</div>

  const plan = billing?.plan ?? 'free_trial'
  const status = billing?.subscriptionStatus
  const trialDaysLeft = getTrialDaysLeft(billing?.trialEndsAt as Parameters<typeof getTrialDaysLeft>[0])
  const queriesUsed = billing?.queriesThisMonth ?? 0
  const queryLimit = 500 // all plans share 500/month for now
  const currentPeriodEnd = billing?.currentPeriodEnd?.toDate?.()
  const isTrial = plan === 'free_trial'
  const isPaid = ['core', 'enhanced', 'full'].includes(plan)

  const effectiveStatus = isTrial
    ? (trialDaysLeft !== null && trialDaysLeft > 0 ? 'trial' : 'trial_expired')
    : (status ?? 'active')

  return (
    <div style={{ padding: '2rem', maxWidth: 680 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 24 }}>Billing & Plans</h1>

      {/* Success banner */}
      {justUpgraded && (
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.875rem 1.25rem', marginBottom: 20, fontSize: '0.875rem', color: '#166534', fontWeight: 500 }}>
          ✓ Subscription activated! Your plan is now live.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: 16, fontSize: '0.8rem', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Current plan card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{PLAN_LABELS[plan] ?? plan}</div>
            {billing?.billingEmail && (
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{billing.billingEmail}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isTrial && trialDaysLeft !== null && (
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                background: trialDaysLeft <= 0 ? '#fee2e2' : trialDaysLeft <= 3 ? '#fef9c3' : '#dbeafe',
                color: trialDaysLeft <= 0 ? '#991b1b' : trialDaysLeft <= 3 ? '#92400e' : '#1e40af',
              }}>
                {trialDaysLeft <= 0 ? 'Expired' : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left`}
              </span>
            )}
            {!isTrial && status && STATUS_COLORS[status] && (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, ...STATUS_COLORS[status] }}>
                {status === 'past_due' ? 'Payment failed' : status}
              </span>
            )}
          </div>
        </div>

        {/* Trial info */}
        {isTrial && trialDaysLeft !== null && trialDaysLeft > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 12 }}>
            Trial ends {billing?.trialEndsAt?.toDate?.()?.toLocaleDateString()}
          </div>
        )}

        {/* Renewal info */}
        {!isTrial && currentPeriodEnd && (
          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: 12 }}>
            {billing?.cancelAtPeriodEnd
              ? `Cancels on ${currentPeriodEnd.toLocaleDateString()}`
              : `Renews ${currentPeriodEnd.toLocaleDateString()}`}
          </div>
        )}

        {/* Usage meter (all plans) */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 6 }}>
            <span>Queries this month</span>
            <span style={{ fontWeight: 600, color: queriesUsed >= queryLimit ? '#991b1b' : 'inherit' }}>
              {queriesUsed} / {queryLimit}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (queriesUsed / queryLimit) * 100)}%`,
              background: queriesUsed >= queryLimit ? '#ef4444' : queriesUsed >= queryLimit * 0.8 ? '#f59e0b' : '#22c55e',
              borderRadius: 9999,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: 6 }}>
            {billing?.queriesTotal ?? 0} queries processed all time
          </div>
        </div>

        {/* Manage billing button */}
        {billing?.stripeCustomerId && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
            >
              {portalLoading ? 'Opening…' : 'Manage payment method & invoices →'}
            </button>
          </div>
        )}
      </div>

      {/* Plans comparison */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-100)', fontWeight: 600, fontSize: '0.9rem' }}>
          Choose a plan
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--gray-100)' }}>
          {[
            {
              key: 'core',
              label: 'Core',
              price: '$199',
              sub: 'per month',
              highlight: false,
            },
            {
              key: 'enhanced',
              label: 'Enhanced',
              price: '$299',
              sub: 'per month',
              highlight: true,
            },
            {
              key: 'full',
              label: 'Full',
              price: '$399',
              sub: 'per month',
              highlight: false,
            },
          ].map((p, i, arr) => {
            const isCurrent = plan === p.key
            return (
              <div
                key={p.key}
                style={{
                  padding: '1.25rem',
                  borderRight: i < arr.length - 1 ? '1px solid var(--gray-100)' : undefined,
                  background: p.highlight ? '#fafafa' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.label}</div>
                  {p.highlight && !isCurrent && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 9999, background: '#1D9E75', color: 'white' }}>
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 9999, background: 'var(--black)', color: 'white' }}>
                      Current
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{p.price}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginBottom: 16 }}>{p.sub}</div>
                <div style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                  <strong>500</strong> queries / month
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 16 }}>Auto-replies ✓ · Katana ✓ · Gmail ✓</div>
                {!isCurrent && (
                  <button
                    onClick={() => handleUpgrade(p.key as 'core' | 'enhanced' | 'full')}
                    disabled={!!checkoutLoading}
                    className="btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.875rem', width: '100%' }}
                  >
                    {checkoutLoading === p.key ? 'Redirecting…' : isTrial ? `Upgrade to ${p.label}` : `Switch to ${p.label}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '0.75rem 1.25rem', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
          All plans include Gmail monitoring, Katana OMS, UPS tracking, and AI-generated responses.
        </div>
      </div>

      {/* Portal note */}
      {billing?.stripeCustomerId && (
        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          Invoice history, payment method changes, and subscription cancellation are managed via the{' '}
          <button onClick={handlePortal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--black)', textDecoration: 'underline', fontSize: '0.8rem', padding: 0 }}>
            Stripe Billing Portal
          </button>.
        </div>
      )}
    </div>
  )
}
