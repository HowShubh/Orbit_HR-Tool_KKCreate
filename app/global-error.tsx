'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Orbit HR hit an unexpected error
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
            {error.message || 'Please try again.'}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#6d4aff',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
