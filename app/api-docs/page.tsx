'use client'

import { useEffect, useRef, useState } from 'react'

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Load Swagger UI CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css'
    document.head.appendChild(link)

    // Load Swagger UI JS
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js'
    script.onload = () => {
      if (containerRef.current && (window as unknown as Record<string, unknown>).SwaggerUIBundle) {
        const SwaggerUIBundle = (window as unknown as Record<string, { new(opts: Record<string, unknown>): unknown }>).SwaggerUIBundle
        new SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [],
          layout: 'BaseLayout',
        })
        setLoaded(true)
      }
    }
    document.body.appendChild(script)

    return () => {
      document.head.removeChild(link)
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      <div style={{
        padding: '24px 32px',
        background: '#1a1a2e',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>WISMO API Documentation</h1>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0' }}>
            32 endpoints across 12 categories
          </p>
        </div>
        <a
          href="/openapi.json"
          download
          style={{
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: 'white',
            fontSize: '0.8rem',
            textDecoration: 'none',
          }}
        >
          Download OpenAPI JSON
        </a>
      </div>
      {!loaded && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          Loading API documentation...
        </div>
      )}
      <div id="swagger-ui" ref={containerRef} />
    </div>
  )
}
