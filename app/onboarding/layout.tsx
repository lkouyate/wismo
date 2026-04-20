'use client'


import { usePathname } from 'next/navigation'
import { StepNav } from '@/components/onboarding/StepNav'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const stepMatch = pathname.match(/step-(\d+)/)
  const currentStep = stepMatch ? parseInt(stepMatch[1]) : 1

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--white)',
        borderBottom: '1px solid var(--gray-200)',
        padding: '0.875rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <img src="/wismo-logo.svg" alt="WISMO" style={{ height: 'clamp(28px, 3vw, 36px)', width: 'auto', maxWidth: '160px' }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
          Step {currentStep} of 6
        </span>
      </div>

      <StepNav current={currentStep} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
        {children}
      </div>
    </div>
  )
}
