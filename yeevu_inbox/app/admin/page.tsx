'use client';

import React, { useState, useEffect } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

type UserTier = 'free' | 'growth' | 'scale' | 'enterprise';

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

interface UserTierRow {
  user_id: string;
  user_email: string | null;
  tier: UserTier;
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
  userTiers: UserTierRow[];
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

const TIER_COLORS: Record<UserTier, string> = {
  free:       '#64748b',
  growth:     '#3b82f6',
  scale:      '#8b5cf6',
  enterprise: '#a855f7',
};

function TierBadge({ tier }: { tier: UserTier }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 6px',
      borderRadius: 4,
      background: TIER_COLORS[tier] + '22',
      color: TIER_COLORS[tier],
      border: `1px solid ${TIER_COLORS[tier]}44`,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {tier}
    </span>
  );
}

function ManageTiers({ rows, onRefresh }: { rows: UserTierRow[]; onRefresh: () => void }) {
  const [pending, setPending] = useState<Record<string, UserTier>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const setTier = (userId: string, tier: UserTier) => {
    setPending((p) => ({ ...p, [userId]: tier }));
  };

  const save = async (row: UserTierRow) => {
    const tier = pending[row.user_id] ?? row.tier;
    setSaving(row.user_id);
    try {
      const res = await fetch(apiPath('/api/admin/tier'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, user_email: row.user_email, tier }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? String(res.status));
      }
      setFeedback((f) => ({ ...f, [row.user_id]: 'saved' }));
      setTimeout(() => setFeedback((f) => { const n = { ...f }; delete n[row.user_id]; return n; }), 2000);
      onRefresh();
    } catch (e) {
      setFeedback((f) => ({ ...f, [row.user_id]: (e as Error).message }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ color: '#64748b', fontSize: 12 }}>
          <th style={{ textAlign: 'left', padding: '4px 0' }}>Email</th>
          <th style={{ textAlign: 'left', padding: '4px 12px' }}>Current</th>
          <th style={{ textAlign: 'left', padding: '4px 12px' }}>Set Tier</th>
          <th style={{ textAlign: 'right', padding: '4px 0' }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const selectedTier = pending[row.user_id] ?? row.tier;
          const isDirty = selectedTier !== row.tier;
          const fb = feedback[row.user_id];
          return (
            <tr key={row.user_id} style={{ borderTop: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 0' }}>{row.user_email ?? row.user_id}</td>
              <td style={{ padding: '6px 12px' }}><TierBadge tier={row.tier} /></td>
              <td style={{ padding: '6px 12px' }}>
                <select
                  value={selectedTier}
                  onChange={(e) => setTier(row.user_id, e.target.value as UserTier)}
                  style={{
                    background: '#1e293b',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <option value="free">free</option>
                  <option value="growth">growth</option>
                  <option value="scale">scale</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 0' }}>
                {fb ? (
                  <span style={{ fontSize: 12, color: fb === 'saved' ? '#22c55e' : '#ef4444' }}>{fb}</span>
                ) : (
                  <button
                    onClick={() => save(row)}
                    disabled={!isDirty || saving === row.user_id}
                    style={{
                      background: isDirty ? '#3b82f6' : 'transparent',
                      color: isDirty ? '#fff' : '#475569',
                      border: '1px solid ' + (isDirty ? '#3b82f6' : '#334155'),
                      borderRadius: 4,
                      padding: '2px 10px',
                      fontSize: 12,
                      cursor: isDirty ? 'pointer' : 'default',
                    }}
                  >
                    {saving === row.user_id ? '...' : 'Save'}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface ScanRow {
  id: string;
  ts: number;
  domain: string;
  auth_status: string;
  user_email: string | null;
  ip: string | null;
  final_score: number | null;
  limit_hit: number;
}

function ScanDataManager() {
  const [filter, setFilter] = useState('');
  const [olderThanDays, setOlderThanDays] = useState('');
  const [preview, setPreview] = useState<{ count: number; rows: ScanRow[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setConfirmStep(false);
    setDeleteResult(null);
    setErr(null);
  };

  const runPreview = async () => {
    const f = filter.trim();
    if (!f) return;
    reset();
    setPreviewing(true);
    try {
      const params = new URLSearchParams({ filter: f });
      if (olderThanDays) params.set('olderThanDays', olderThanDays);
      const res = await fetch(apiPath(`/api/admin/scans?${params}`));
      const d = await res.json() as { count?: number; rows?: ScanRow[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? String(res.status));
      setPreview({ count: d.count ?? 0, rows: d.rows ?? [] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const doDelete = async () => {
    const f = filter.trim();
    if (!f) return;
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch(apiPath('/api/admin/scans'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: f, olderThanDays: olderThanDays ? Number(olderThanDays) : undefined }),
      });
      const d = await res.json() as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? String(res.status));
      setDeleteResult(d.deleted ?? 0);
      setPreview(null);
      setConfirmStep(false);
    } catch (e) {
      setErr((e as Error).message);
      setConfirmStep(false);
    } finally {
      setDeleting(false);
    }
  };

  const inputStyle = {
    background: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
    outline: 'none',
  };

  const btnStyle = (active: boolean, danger = false) => ({
    background: active ? (danger ? '#ef4444' : '#3b82f6') : 'transparent',
    color: active ? '#fff' : '#475569',
    border: `1px solid ${active ? (danger ? '#ef4444' : '#3b82f6') : '#334155'}`,
    borderRadius: 4,
    padding: '4px 12px',
    fontSize: 12,
    cursor: active ? 'pointer' : 'default',
  } as React.CSSProperties);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          value={filter}
          onChange={e => { setFilter(e.target.value); reset(); }}
          placeholder="anonymous  or  user@example.com"
          style={{ ...inputStyle, width: 260 }}
        />
        <input
          type="number"
          min={1}
          value={olderThanDays}
          onChange={e => { setOlderThanDays(e.target.value); reset(); }}
          placeholder="older than N days (optional)"
          style={{ ...inputStyle, width: 200 }}
        />
        <button
          onClick={runPreview}
          disabled={!filter.trim() || previewing}
          style={btnStyle(!!filter.trim() && !previewing)}
        >
          {previewing ? 'Querying…' : 'Search'}
        </button>
      </div>

      {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>{err}</p>}

      {deleteResult !== null && (
        <p style={{ color: '#22c55e', fontSize: 13, margin: '0 0 8px' }}>
          ✓ Deleted {deleteResult} record{deleteResult !== 1 ? 's' : ''}.
        </p>
      )}

      {preview && (
        <>
          {/* Count + delete controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: preview.count === 0 ? '#64748b' : '#f59e0b' }}>
              {preview.count === 0
                ? 'No matching records.'
                : `${preview.count} record${preview.count !== 1 ? 's' : ''} match${preview.count > 500 ? ` — showing 500 most recent` : ''}.`}
            </span>
            {preview.count > 0 && !confirmStep && (
              <button onClick={() => setConfirmStep(true)} style={btnStyle(true, true)}>
                Delete all {preview.count}
              </button>
            )}
            {confirmStep && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#fca5a5' }}>Permanently delete {preview.count} rows?</span>
                <button onClick={doDelete} disabled={deleting} style={btnStyle(true, true)}>
                  {deleting ? 'Deleting…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirmStep(false)} style={btnStyle(false)}>
                  Cancel
                </button>
              </span>
            )}
          </div>

          {/* Results table */}
          {preview.rows.length > 0 && (
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
                  {preview.rows.map((row) => {
                    const timeStr = new Date(Number(row.ts)).toISOString().replace('T', ' ').slice(0, 19);
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
          )}
        </>
      )}
    </div>
  );
}

interface UserProject {
  domain: string;
  addedAt: string;
  folder?: string;
  lastScan: { overallScore: number } | null;
  scanHistory: { finalScore: number }[];
}

function ViewUserProjects({ users }: { users: UserTierRow[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [projects, setProjects] = useState<UserProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (userId: string) => {
    if (!userId) { setProjects(null); return; }
    setLoading(true);
    setErr(null);
    setProjects(null);
    try {
      const res = await fetch(apiPath(`/api/admin/users/${encodeURIComponent(userId)}/projects`));
      const d = await res.json() as { projects?: UserProject[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? String(res.status));
      setProjects(d.projects ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedId(id);
    load(id);
  };

  // Group by folder for display
  const grouped = projects
    ? projects.reduce((acc, p) => {
        const key = p.folder ?? '';
        (acc[key] ??= []).push(p);
        return acc;
      }, {} as Record<string, UserProject[]>)
    : null;

  const folderKeys = grouped
    ? Object.keys(grouped).sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))
    : [];

  return (
    <div>
      <select
        value={selectedId}
        onChange={handleChange}
        style={{
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 13,
          cursor: 'pointer',
          marginBottom: 16,
          minWidth: 280,
        }}
      >
        <option value="">— select a user —</option>
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.user_email ?? u.user_id} ({u.tier})
          </option>
        ))}
      </select>

      {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}
      {err && <p style={{ color: '#ef4444', fontSize: 13 }}>{err}</p>}

      {projects !== null && !loading && (
        projects.length === 0 ? (
          <p style={{ color: '#475569', fontSize: 13 }}>No saved projects.</p>
        ) : (
          <>
            <p style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
            {folderKeys.map((key) => {
              const label = key === '' ? 'Uncategorised' : key;
              const items = grouped![key];
              return (
                <div key={key} style={{ marginBottom: 20 }}>
                  {folderKeys.length > 1 && (
                    <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      {label} ({items.length})
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: '#64748b', fontSize: 12 }}>
                        <th style={{ textAlign: 'left', padding: '4px 12px 4px 0' }}>Domain</th>
                        <th style={{ textAlign: 'right', padding: '4px 12px' }}>Score</th>
                        <th style={{ textAlign: 'right', padding: '4px 12px' }}>Scans</th>
                        <th style={{ textAlign: 'right', padding: '4px 0' }}>Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => (
                        <tr key={p.domain} style={{ borderTop: '1px solid #1e293b' }}>
                          <td style={{ padding: '5px 12px 5px 0' }}>{p.domain}</td>
                          <td style={{ textAlign: 'right', padding: '5px 12px' }}>
                            {p.lastScan ? p.lastScan.overallScore : '—'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '5px 12px', color: '#64748b' }}>
                            {p.scanHistory.length}
                          </td>
                          <td style={{ textAlign: 'right', padding: '5px 0', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(p.addedAt).toISOString().slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </>
        )
      )}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch(apiPath('/api/admin'))
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error((d as { error?: string }).error || String(r.status)); });
        return r.json();
      })
      .then((d) => setData(d as AdminData))
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

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

      {/* Manage User Tiers */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Manage User Tiers</h2>
        {data.userTiers.length === 0 ? (
          <p style={{ color: '#475569', fontSize: 13 }}>No authenticated users yet.</p>
        ) : (
          <ManageTiers rows={data.userTiers} onRefresh={load} />
        )}
      </section>

      {/* View User Projects */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>View User Projects</h2>
        <p style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
          Select a user to browse their saved projects and folder structure.
        </p>
        {data.userTiers.length === 0 ? (
          <p style={{ color: '#475569', fontSize: 13 }}>No authenticated users yet.</p>
        ) : (
          <ViewUserProjects users={data.userTiers} />
        )}
      </section>

      {/* Scan Data Manager */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Scan Data</h2>
        <p style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
          Filter scan_events by <code style={{ color: '#94a3b8' }}>auth_status</code> (type <em>anonymous</em>) or <code style={{ color: '#94a3b8' }}>user_email</code>. Optionally limit to records older than N days.
        </p>
        <ScanDataManager />
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
