'use client'
import { use, useEffect, useState } from 'react'
import { apiPath, appPath } from '@/lib/api'

interface Snapshot {
  id: string
  version: number
  label: string
  trigger: string
  createdAt: string
  recordCount: number
}

export default function SnapshotsPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  function load() {
    setLoading(true)
    fetch(apiPath(`/api/dns/snapshots/${domain}`))
      .then((r) => { if (r.status === 401) { window.location.href = apiPath('/api/auth/login'); return null } return r.json() })
      .then((json) => { if (json?.success) setSnapshots(json.data) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [domain])

  async function takeSnapshot() {
    await fetch(apiPath(`/api/dns/snapshots/${domain}`), { method: 'POST' })
    load()
  }

  async function restore(id: string) {
    if (!confirm('This will restore your DNS to this snapshot. Current records will be replaced. Continue?')) return
    setRestoringId(id)
    setMessage(null)
    const res = await fetch(apiPath(`/api/dns/snapshots/restore/${id}`), { method: 'POST' })
    const json = await res.json()
    setMessage({ text: json.success ? `Restored snapshot. ${json.data?.created} records created.` : json.error ?? 'Restore failed', ok: json.success })
    setRestoringId(null)
    if (json.success) load()
  }

  const TRIGGER_LABEL: Record<string, string> = {
    onboarding: 'Onboarding',
    'pre-integration': 'Before integration',
    manual: 'Manual',
  }

  return (
    <div style={{ maxWidth: 800, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 8 }}>
        <a href={appPath(`/domains/${domain}`)} style={{ color: '#64748b', fontSize: 13 }}>← {domain}</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Snapshots</h1>
        <button
          onClick={takeSnapshot}
          style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #38bdf8', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
        >
          Take snapshot
        </button>
      </div>

      {message && (
        <p style={{ color: message.ok ? '#4ade80' : '#f87171', marginBottom: 16, fontSize: 14 }}>{message.text}</p>
      )}

      {loading && <p style={{ color: '#94a3b8' }}>Loading snapshots…</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {snapshots.map((s) => (
          <div key={s.id} style={{ background: '#1e293b', borderRadius: 10, padding: '16px 20px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ minWidth: 36, textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>v{s.version}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{s.label}</p>
              <p style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                {TRIGGER_LABEL[s.trigger] ?? s.trigger} · {s.recordCount} records · {new Date(s.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => restore(s.id)}
              disabled={restoringId === s.id}
              style={{ background: '#0f172a', color: '#f87171', border: '1px solid #f87171', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}
            >
              {restoringId === s.id ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
