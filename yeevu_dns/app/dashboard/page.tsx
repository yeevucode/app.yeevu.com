'use client'
import { useEffect, useState } from 'react'
import { apiPath, appPath } from '@/lib/api'

interface Domain {
  id: string
  name: string
  zone_id?: string
  onboarded_at: string
}

export default function DashboardPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiPath('/api/dns/domains'))
      .then((r) => {
        if (r.status === 401) { window.location.href = apiPath('/api/auth/login'); return null }
        return r.json()
      })
      .then((json) => {
        if (!json) return
        if (json.success) setDomains(json.data)
        else setError(json.error ?? 'Failed to load domains')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: 40, color: '#94a3b8' }}>Loading…</p>

  return (
    <div style={{ maxWidth: 800, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Your Domains</h1>
        <a
          href={appPath('/')}
          style={{
            background: '#38bdf8',
            color: '#0f172a',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + Add domain
        </a>
      </div>

      {error && <p style={{ color: '#f87171', marginBottom: 16 }}>{error}</p>}

      {domains.length === 0 && !error ? (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>No domains connected yet.</p>
          <a href={appPath('/')} style={{ color: '#38bdf8', fontSize: 14 }}>Connect your first domain →</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {domains.map((d) => (
            <a
              key={d.id}
              href={appPath(`/domains/${d.name}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#1e293b',
                borderRadius: 10,
                padding: '16px 20px',
                border: '1px solid #334155',
                transition: 'border-color 0.15s',
              }}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: 16 }}>{d.name}</p>
                <p style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  Connected {new Date(d.onboarded_at).toLocaleDateString()}
                </p>
              </div>
              <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 18 }}>›</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
