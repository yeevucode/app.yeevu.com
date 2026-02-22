'use client';

import { useState, useEffect } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

interface RecentScan {
  id: string;
  ts: number;
  domain: string;
  auth_status: string;
  user_email: string | null;
  ip: string | null;
  final_score: number | null;
  limit_hit: number;
}

interface AdminData {
  scanTotals: { '24h': number; '7d': number; '30d': number };
  authSplit: { auth_status: string; count: number }[];
  limitHits: { '24h': number; '7d': number; '30d': number };
  topDomains: { domain: string; count: number }[];
  scoreDistribution: { bucket: number; count: number }[];
  checkFailures: Record<string, number>;
  reputationBreakdown: { reputation_tier: string; count: number }[];
  topUsers: { user_id: string; user_email: string | null; count: number }[];
  projectSaves: { '24h': number; '7d': number; '30d': number };
  recentScans: RecentScan[];
}

function Bar({ value, max, color = '#3b82f6' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#1e293b', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4 }} />
      </div>
      <span style={{ minWidth: 36, textAlign: 'right', fontSize: 13 }}>{pct}%</span>
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiPath('/api/admin'))
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || String(r.status)); });
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40, color: '#ef4444' }}>Error: {error}</div>;
  }

  if (!data) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40, color: '#e2e8f0' }}>Loading...</div>;
  }

  const totalScans30d = Number(data.scanTotals['30d']) || 1;
  const totalFailures = Number(data.checkFailures.total) || 1;

  const authMap: Record<string, number> = {};
  for (const row of data.authSplit) {
    authMap[String(row.auth_status)] = Number(row.count);
  }

  const scoreMax = Math.max(...data.scoreDistribution.map((r) => Number(r.count)), 1);
  const repMap: Record<string, number> = {};
  for (const row of data.reputationBreakdown) {
    repMap[String(row.reputation_tier)] = Number(row.count);
  }
  const repTotal = Object.values(repMap).reduce((a, b) => a + b, 0) || 1;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 32, maxWidth: 1000, fontFamily: 'monospace', color: '#e2e8f0', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, marginBottom: 32, color: '#f1f5f9' }}>Admin Dashboard</h1>

      {/* Overview */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Overview</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#64748b', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '4px 12px 4px 0' }}></th>
              <th style={{ textAlign: 'right', padding: '4px 12px' }}>24h</th>
              <th style={{ textAlign: 'right', padding: '4px 12px' }}>7d</th>
              <th style={{ textAlign: 'right', padding: '4px 12px' }}>30d</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Total scans', data.scanTotals],
              ['Limit hits', data.limitHits],
              ['Project saves', data.projectSaves],
            ].map(([label, vals]) => {
              const v = vals as { '24h': number; '7d': number; '30d': number };
              return (
                <tr key={String(label)}>
                  <td style={{ padding: '4px 12px 4px 0' }}>{String(label)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 12px' }}>{Number(v['24h'])}</td>
                  <td style={{ textAlign: 'right', padding: '4px 12px' }}>{Number(v['7d'])}</td>
                  <td style={{ textAlign: 'right', padding: '4px 12px' }}>{Number(v['30d'])}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ padding: '4px 12px 4px 0' }}>Anonymous / Auth (30d)</td>
              <td colSpan={3} style={{ textAlign: 'right', padding: '4px 12px' }}>
                {authMap['anonymous'] ?? 0} / {authMap['authenticated'] ?? 0}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Check Failure Rates */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Check Failure Rates (30d)</h2>
        {(['dmarc', 'spf', 'dkim', 'mx', 'smtp'] as const).map((check) => {
          const fails = Number(data.checkFailures[`${check}_fail`]) || 0;
          return (
            <div key={check} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ textTransform: 'uppercase', fontSize: 12 }}>{check}</span>
              <Bar value={fails} max={totalFailures} color='#ef4444' />
            </div>
          );
        })}
      </section>

      {/* Score Distribution */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Score Distribution (30d)</h2>
        {data.scoreDistribution.map((row) => (
          <div key={row.bucket} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8, marginBottom: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>{row.bucket}–{Number(row.bucket) + 9}</span>
            <Bar value={Number(row.count)} max={scoreMax} color='#3b82f6' />
          </div>
        ))}
      </section>

      {/* Reputation + Top Domains */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
        <section>
          <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Reputation Tiers (30d)</h2>
          {Object.entries(repMap).map(([tier, count]) => (
            <div key={tier} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, marginBottom: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>{tier}</span>
              <Bar value={count} max={repTotal} color='#f59e0b' />
            </div>
          ))}
        </section>

        <section>
          <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Top Domains (30d)</h2>
          {data.topDomains.slice(0, 10).map((row) => (
            <div key={row.domain} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{row.domain}</span>
              <span style={{ color: '#94a3b8' }}>{Number(row.count)} ({Math.round(Number(row.count) / totalScans30d * 100)}%)</span>
            </div>
          ))}
        </section>
      </div>

      {/* Top Users */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Top Users (30d)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#64748b', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '4px 0' }}>Email</th>
              <th style={{ textAlign: 'right', padding: '4px 0' }}>Scans</th>
            </tr>
          </thead>
          <tbody>
            {data.topUsers.map((row) => (
              <tr key={row.user_id}>
                <td style={{ padding: '4px 0' }}>{row.user_email ?? row.user_id}</td>
                <td style={{ textAlign: 'right', padding: '4px 0' }}>{Number(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Recent Scans */}
      <section>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Recent Scans (last 100)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Domain</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>IP</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>User</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Score</th>
                <th style={{ textAlign: 'right', padding: '4px 0' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentScans.map((row) => {
                const date = new Date(Number(row.ts));
                const timeStr = date.toISOString().replace('T', ' ').slice(0, 19);
                const isAuth = row.auth_status === 'authenticated';
                const isLimitHit = Number(row.limit_hit) === 1;
                return (
                  <tr key={row.id} style={{ borderTop: '1px solid #1e293b' }}>
                    <td style={{ padding: '4px 8px 4px 0', color: '#64748b', whiteSpace: 'nowrap' }}>{timeStr}</td>
                    <td style={{ padding: '4px 8px' }}>{row.domain}</td>
                    <td style={{ padding: '4px 8px', color: '#94a3b8', fontFamily: 'monospace' }}>{row.ip ?? '—'}</td>
                    <td style={{ padding: '4px 8px', color: isAuth ? '#e2e8f0' : '#64748b' }}>
                      {isAuth ? (row.user_email ?? 'auth') : 'anon'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', color: row.final_score !== null ? '#e2e8f0' : '#475569' }}>
                      {row.final_score !== null ? row.final_score : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 0', color: isLimitHit ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap' }}>
                      {isLimitHit ? 'limit hit' : 'ok'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
