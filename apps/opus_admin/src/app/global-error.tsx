'use client'

// Last-resort error boundary. Renders when the root layout itself throws
// (e.g. ClerkProvider can't initialise, env vars missing). Without this,
// Next.js shows a blank "Application error: a client-side exception has
// occurred" page with no info — leaving admins stuck.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[opus_admin] global-error boundary tripped:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: '#FDFDFD',
          color: '#1A1A1A',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 560, width: '100%' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
            OpusFesta admin failed to load
          </h1>
          <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px' }}>
            The admin shell crashed while starting up. Share the details below
            with the engineering team and try refreshing.
          </p>
          <pre
            style={{
              fontSize: 12,
              background: '#F4F4F4',
              border: '1px solid #E5E5E5',
              borderRadius: 8,
              padding: 12,
              overflow: 'auto',
              maxHeight: 220,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error?.message || 'Unknown error'}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
          <button data-opus-button="control"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: '8px 14px',
              border: 'none',
              borderRadius: 8,
              background: '#C9A0DC',
              color: '#1A1A1A',
              fontWeight: 600,
              fontSize: 14,
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
