'use client'
import { use, useEffect, useState } from 'react'
import { apiPath, appPath } from '@/lib/api'

interface DnsRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
}

const TYPE_COLORS: Record<string, string> = {
  A: '#38bdf8', AAAA: '#818cf8', MX: '#34d399', TXT: '#fbbf24',
  CNAME: '#f472b6', NS: '#94a3b8',
}

export default function DomainPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiPath(`/api/dns/domains/${domain}/records`))
      .then((r) => {
        if (r.status === 401) { window.location.href = apiPath('/api/auth/login'); return null }
        return r.json()
      })
      .then((json) => {
        if (!json) return
        if (json.success) setRecords(json.data)
        else setError(json.error ?? 'Failed to load records')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [domain])

  return (
    <div style={{ maxWidth: 900, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <a href={appPath('/dashboard')} style={{ color: '#64748b', fontSize: 13 }}>← Dashboard</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{domain}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={appPath(`/domains/${domain}/integrations`)} style={btnStyle('secondary')}>Integrations</a>
          <a href={appPath(`/domains/${domain}/snapshots`)} style={btnStyle('secondary')}>Snapshots</a>
        </div>
      </div>

      {error && <p style={{ color: '#f87171', marginBottom: 16 }}>{error}</p>}
      {loading && <p style={{ color: '#94a3b8' }}>Loading records…</p>}

      {!loading && records.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                {['Type', 'Name', 'Content', 'TTL'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: TYPE_COLORS[r.type] + '22', color: TYPE_COLORS[r.type] ?? '#94a3b8', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                      {r.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#cbd5e1', fontFamily: 'monospace' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{r.ttl === 1 ? 'Auto' : `${r.ttl}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary'): React.CSSProperties {
  return variant === 'primary'
    ? { background: '#38bdf8', color: '#0f172a', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }
    : { background: '#1e293b', color: '#94a3b8', padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid #334155' }
}
