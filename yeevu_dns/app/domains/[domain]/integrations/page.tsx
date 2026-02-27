'use client'
import { use, useEffect, useState } from 'react'
import { apiPath, appPath } from '@/lib/api'

interface Integration {
  id: string
  name: string
  description: string
  params: { name: string; required: boolean; description: string }[]
}

interface StepResult {
  action: string
  type: string
  name: string
  status: 'success' | 'error' | 'skipped'
  error?: string
}

export default function IntegrationsPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [nlpInput, setNlpInput] = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [nlpResult, setNlpResult] = useState<{ clarification?: string; integrationName?: string; steps?: StepResult[]; success?: boolean } | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ id: string; steps: StepResult[]; success: boolean } | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    fetch(apiPath('/api/dns/integrations'))
      .then((r) => { if (r.status === 401) { window.location.href = apiPath('/api/auth/login'); return null } return r.json() })
      .then((json) => { if (json?.success) setIntegrations(json.data) })
      .finally(() => setLoading(false))
  }, [])

  async function handleNlp(e: React.FormEvent) {
    e.preventDefault()
    setNlpLoading(true)
    setNlpResult(null)
    const res = await fetch(apiPath('/api/dns/nlp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: nlpInput, domain }),
    })
    const json = await res.json()
    if (json.success) setNlpResult(json.data)
    setNlpLoading(false)
  }

  async function runIntegration(id: string) {
    setRunningId(id)
    setRunResult(null)
    const params: Record<string, string> = { domain, ...(paramValues[id] ?? {}) }
    const res = await fetch(apiPath(`/api/dns/integrations/${id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, params }),
    })
    const json = await res.json()
    if (json.success) setRunResult({ id, steps: json.data.steps, success: json.data.success })
    setRunningId(null)
  }

  const extraParams = (i: Integration) => i.params.filter((p) => p.name !== 'domain')

  return (
    <div style={{ maxWidth: 860, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 8 }}>
        <a href={appPath(`/domains/${domain}`)} style={{ color: '#64748b', fontSize: 13 }}>← {domain}</a>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Integrations</h1>

      {/* NLP Box */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 32, border: '1px solid #334155' }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Plain English</p>
        <form onSubmit={handleNlp} style={{ display: 'flex', gap: 10 }}>
          <input
            value={nlpInput}
            onChange={(e) => setNlpInput(e.target.value)}
            placeholder={`e.g. "set up Google Workspace email for ${domain}"`}
            style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={nlpLoading || !nlpInput.trim()}
            style={{ background: nlpLoading ? '#334155' : '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, padding: '0 20px', fontWeight: 600, fontSize: 14 }}
          >
            {nlpLoading ? '…' : 'Go'}
          </button>
        </form>
        {nlpResult && (
          <div style={{ marginTop: 16 }}>
            {nlpResult.clarification ? (
              <p style={{ color: '#fbbf24', fontSize: 14 }}>{nlpResult.clarification}</p>
            ) : (
              <div>
                <p style={{ color: '#4ade80', fontSize: 14, marginBottom: 10 }}>
                  {nlpResult.success ? '✓' : '✗'} {nlpResult.integrationName}
                </p>
                {nlpResult.steps?.map((s, i) => (
                  <p key={i} style={{ fontSize: 12, color: s.status === 'error' ? '#f87171' : '#64748b', fontFamily: 'monospace' }}>
                    {s.status === 'error' ? '✗' : s.status === 'skipped' ? '–' : '✓'} {s.action} {s.type} {s.name} {s.error ?? ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Integration catalog */}
      {loading && <p style={{ color: '#94a3b8' }}>Loading integrations…</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {integrations.map((i) => {
          const extra = extraParams(i)
          const isRunning = runningId === i.id
          const result = runResult?.id === i.id ? runResult : null
          return (
            <div key={i.id} style={{ background: '#1e293b', borderRadius: 10, padding: '16px 20px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{i.name}</p>
                  <p style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{i.description}</p>
                  <p style={{ fontSize: 11, color: '#334155', marginTop: 4, fontFamily: 'monospace' }}>{i.id}</p>
                </div>
                <button
                  onClick={() => runIntegration(i.id)}
                  disabled={isRunning}
                  style={{ background: isRunning ? '#334155' : '#0f172a', color: isRunning ? '#64748b' : '#38bdf8', border: '1px solid #38bdf8', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {isRunning ? 'Running…' : 'Run'}
                </button>
              </div>
              {extra.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {extra.map((p) => (
                    <input
                      key={p.name}
                      placeholder={p.name + (p.required ? ' *' : '')}
                      value={paramValues[i.id]?.[p.name] ?? ''}
                      onChange={(e) => setParamValues((prev) => ({ ...prev, [i.id]: { ...(prev[i.id] ?? {}), [p.name]: e.target.value } }))}
                      style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', color: '#e2e8f0', fontSize: 13, width: 180 }}
                    />
                  ))}
                </div>
              )}
              {result && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #334155' }}>
                  {result.steps.map((s, idx) => (
                    <p key={idx} style={{ fontSize: 12, color: s.status === 'error' ? '#f87171' : s.status === 'skipped' ? '#64748b' : '#4ade80', fontFamily: 'monospace' }}>
                      {s.status === 'error' ? '✗' : s.status === 'skipped' ? '–' : '✓'} {s.action} {s.type} {s.name} {s.error ?? ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
