import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastContextValue {
  show: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  const show = useCallback((msg: string) => {
    setMessage(msg)
    setVisible(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(false), 2500)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          padding: '0.75rem 1.5rem',
          borderRadius: '0.75rem',
          background: 'rgba(51,65,85,0.95)',
          color: '#fff',
          fontSize: '0.875rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(1.25rem)',
          transition: 'all 0.3s',
          pointerEvents: 'none',
          maxWidth: '90vw',
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
    </ToastContext.Provider>
  )
}
