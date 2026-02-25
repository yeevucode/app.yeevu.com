'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckResult } from '../../lib/types/scanner';

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

const STATUS_COLORS = {
  pass: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: '#4ade80', label: 'Pass' },
  warn: { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.35)',  text: '#fbbf24', label: 'Warning' },
  fail: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171', label: 'Fail' },
};

interface Props {
  check: string;
  placeholder?: string;
}

export default function CheckerWidget({ check, placeholder = 'example.com' }: Props) {
  const searchParams = useSearchParams();
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedDomain, setCheckedDomain] = useState('');

  // Auto-run if domain is in the URL query string
  useEffect(() => {
    const d = searchParams.get('domain');
    if (d) {
      setDomain(d);
      runCheck(d);
    }
  }, []); // eslint-disable-line

  const runCheck = async (d: string) => {
    const cleaned = d.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    if (!cleaned) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setCheckedDomain(cleaned);

    try {
      const res = await fetch(apiPath(`/api/scan/${check}?domain=${encodeURIComponent(cleaned)}&maxAge=300`));
      const data = await res.json();
      if (!res.ok || !data.result) throw new Error(data.error || 'Check failed');
      setResult(data.result as CheckResult);
      setCached(!!data.cached);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runCheck(domain);
  };

  const colors = result ? STATUS_COLORS[result.status] : null;

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Input form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder={placeholder}
          required
          style={{
            flex: 1,
            padding: '0.875rem 1.125rem',
            background: 'rgba(15,23,42,0.8)',
            border: '2px solid rgba(100,116,139,0.5)',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '1rem',
            fontWeight: 600,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          className="search-button"
          style={{ flexShrink: 0, padding: '0.875rem 1.5rem' }}
        >
          {loading ? 'Checking…' : 'Check'}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#94a3b8', fontSize: '0.9rem' }}>
          <div className="spinner" style={{ width: 18, height: 18 }} />
          Checking {checkedDomain}…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          padding: '0.875rem 1.125rem',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '8px',
          color: '#fca5a5',
          fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && colors && (
        <div style={{
          padding: '1.25rem',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '10px',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '20px',
                background: colors.border,
                color: colors.text,
                fontWeight: 700,
                fontSize: '0.8125rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {colors.label}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                {checkedDomain}
              </span>
              {cached && (
                <span style={{ color: '#475569', fontSize: '0.75rem' }}>cached</span>
              )}
            </div>
            <span style={{
              color: colors.text,
              fontWeight: 700,
              fontSize: '1.125rem',
            }}>
              {result.score}/100
            </span>
          </div>

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <ul style={{ margin: 0, padding: '0 0 0 1.25rem', color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {result.recommendations.map((r, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* CTA to full scan */}
      {result && !loading && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(100,116,139,0.2)', fontSize: '0.875rem', color: '#64748b' }}>
          Want a complete email health check including DMARC, SPF, DKIM, blacklists and more?{' '}
          <a href={apiPath(`/?domain=${encodeURIComponent(checkedDomain)}`)} style={{ color: 'var(--primary, #818cf8)', textDecoration: 'none', fontWeight: 500 }}>
            Run a full deliverability scan →
          </a>
        </div>
      )}
    </div>
  );
}
