'use client'

const STEPS = [
  { n: 1, label: 'Katana' },
  { n: 2, label: 'Carriers' },
  { n: 3, label: 'Customers' },
  { n: 4, label: 'Gmail' },
  { n: 5, label: 'Test' },
  { n: 6, label: 'Go Live' },
]

export function StepNav({ current }: { current: number }) {
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
      {STEPS.map((step, i) => (
        <div key={step.n} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: step.n < current ? 'var(--black)' : step.n === current ? 'var(--black)' : 'var(--gray-100)',
              color: step.n <= current ? 'var(--white)' : 'var(--gray-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {step.n < current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : step.n}
            </div>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: step.n === current ? 600 : 400,
              color: step.n === current ? 'var(--black)' : step.n < current ? 'var(--gray-500)' : 'var(--gray-400)',
              whiteSpace: 'nowrap',
            }}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              width: 32,
              height: 1,
              background: step.n < current ? 'var(--gray-300)' : 'var(--gray-200)',
              margin: '0 8px',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}
