'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

interface ToastContextValue {
  addToast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const COLORS: Record<Toast['type'], { bg: string; border: string; text: string }> = {
  info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  success: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 8000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380,
        }}>
          {toasts.map(t => {
            const c = COLORS[t.type]
            return (
              <div
                key={t.id}
                style={{
                  background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                  padding: '12px 16px', borderRadius: 10, fontSize: '0.82rem', lineHeight: 1.5,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 10,
                  animation: 'toastSlideIn 0.25s ease-out',
                }}
              >
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: c.text, opacity: 0.5, fontSize: '1rem', padding: 0, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
