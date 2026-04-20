'use client'

import { useRouter } from 'next/navigation'

const STEPS = [
  { n: 1, label: 'Katana' },
  { n: 2, label: 'Carriers' },
  { n: 3, label: 'Customers' },
  { n: 4, label: 'Gmail' },
  { n: 5, label: 'Test' },
  { n: 6, label: 'Go Live' },
]

export function StepNav({ current }: { current: number }) {
  const router = useRouter()

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      background: 'var(--white)',
      borderBottom: '1px solid var(--gray-200)',
      padding: '1rem 2rem',
      justifyContent: 'center',
    }}>
      {STEPS.map((step, i) => {
        const isDone = step.n < current
        const isCurrent = step.n === current

        return (
          <div key={step.n} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={isDone ? () => router.push(`/onboarding/step-${step.n}`) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: isDone ? 'pointer' : 'default',
              }}
              title={isDone ? `Go back to ${step.label}` : undefined}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isDone || isCurrent ? 'var(--black)' : 'var(--gray-100)',
                color: isDone || isCurrent ? 'var(--white)' : 'var(--gray-400)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                flexShrink: 0,
                transition: 'opacity 0.15s',
                opacity: isDone ? 0.7 : 1,
              }}>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                ) : step.n}
              </div>
              <span style={{
                fontSize: '0.8rem',
                fontWeight: isCurrent ? 600 : 400,
                color: isCurrent ? 'var(--black)' : isDone ? 'var(--gray-500)' : 'var(--gray-400)',
                whiteSpace: 'nowrap',
                textDecoration: isDone ? 'underline' : 'none',
                textDecorationColor: 'var(--gray-300)',
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 32,
                height: 1,
                background: isDone ? 'var(--gray-300)' : 'var(--gray-200)',
                margin: '0 8px',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
