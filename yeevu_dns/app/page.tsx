'use client'
import { useState } from 'react'
import { apiPath, appPath } from '@/lib/api'

export default function OnboardingPage() {
  const [domain, setDomain] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch(apiPath('/api/dns/onboarding'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      })
      const json = await res.json()
      if (json.success) {
        setStatus('success')
        setMessage(`${json.data.recordsImported} records imported. Redirecting…`)
        setTimeout(() => { window.location.href = appPath('/dashboard') }, 1500)
      } else {
        setStatus('error')
        setMessage(json.error ?? 'Something went wrong')
      }
    } catch {
      setStatus('error')
      setMessage('Network error — please try again')
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Connect your domain</h1>
      <p style={{ color: '#94a3b8', marginBottom: 32 }}>
        Point your nameservers to Yeevu, then enter your domain below to import your DNS records.
      </p>

      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Change your nameservers to:</p>
        <code style={{ display: 'block', background: '#0f172a', padding: '10px 14px', borderRadius: 6, fontSize: 13, color: '#38bdf8' }}>
          ns1.yeevudns.com<br />ns2.yeevudns.com
        </code>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="yourdomain.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
          style={{
            width: '100%',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#e2e8f0',
            fontSize: 15,
            marginBottom: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            width: '100%',
            background: status === 'loading' ? '#334155' : '#38bdf8',
            color: '#0f172a',
            border: 'none',
            borderRadius: 8,
            padding: '12px 0',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {status === 'loading' ? 'Verifying…' : 'Connect domain'}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: 16, color: status === 'error' ? '#f87171' : '#4ade80', fontSize: 14 }}>
          {message}
        </p>
      )}
    </div>
  )
}
