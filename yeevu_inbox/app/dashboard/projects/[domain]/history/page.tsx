'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ORDERED_CHECKS, CHECK_LABELS } from '../../../../../lib/constants/scoring';

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

interface ScanHistoryEntry {
  ts: string;
  finalScore: number;
  configScore: number;
  reputationTier: string;
  checks: Record<string, number>;
}

interface Project {
  domain: string;
  scanHistory: ScanHistoryEntry[];
}

const getScoreColor = (score: number) => {
  if (score >= 70) return 'var(--success)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const thBase: React.CSSProperties = {
  padding: '10px 16px',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
  borderBottom: '1px solid rgba(100,116,139,0.2)',
};

const tdBase: React.CSSProperties = {
  padding: '10px 16px',
  whiteSpace: 'nowrap',
};

// Custom tooltip for the chart
interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid rgba(100,116,139,0.3)',
      borderRadius: '6px',
      padding: '10px 14px',
      fontSize: '0.8125rem',
    }}>
      <div style={{ color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>{label}</div>
      {payload.map((item) => (
        <div key={item.name} style={{ color: item.color, display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
          <span>{item.name}</span>
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const params = useParams();
  const domain = decodeURIComponent(params.domain as string);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const main = document.querySelector('.main') as HTMLElement | null;
    if (main) {
      main.style.maxWidth = 'none';
      return () => { main.style.maxWidth = ''; };
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}`));
        if (res.status === 401) {
          setError('Sign in to view scan history.');
          return;
        }
        if (!res.ok) {
          setError('Project not found.');
          return;
        }
        const data = await res.json();
        setProject(data.project);
      } catch {
        setError('Failed to load history.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [domain]);

  async function handleClearHistory() {
    if (!confirm(`Clear all scan history for ${domain}? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const res = await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}/history`), { method: 'DELETE' });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, scanHistory: [] } : prev);
      }
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <Link href="/dashboard" style={{ color: '#64748b', fontSize: '0.875rem' }}>← Back to Projects</Link>
        <h2 style={{ marginTop: '1rem' }}>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  const history = project?.scanHistory ?? [];

  const presentChecks = ORDERED_CHECKS;

  // Chart data — history is newest-first, reverse for chronological order
  const chartData = [...history].reverse().map(entry => ({
    date: shortDate(entry.ts),
    'Final Score': entry.finalScore,
    'Config Score': entry.configScore,
  }));

  const showChart = history.length >= 3;

  // Dynamic Y-axis: give 5pts of breathing room below the lowest score, cap at 100
  const allScores = history.flatMap(e => [e.finalScore, e.configScore]);
  const minScore = Math.min(...allScores);
  const yMin = Math.max(0, minScore - 5);

  return (
    <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '0 1.5rem' }}>
      <div className="dashboard-header">
        <div>
          <Link href="/dashboard" style={{ color: '#64748b', fontSize: '0.875rem', textDecoration: 'none' }}>
            ← Back to Projects
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>{domain}</h1>
          <p className="dashboard-subtitle">Scan History</p>
        </div>
        {project && project.scanHistory.length > 0 && (
          <button
            onClick={handleClearHistory}
            disabled={clearing}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444',
              borderRadius: '6px',
              cursor: clearing ? 'not-allowed' : 'pointer',
              opacity: clearing ? 0.6 : 1,
            }}
          >
            {clearing ? 'Clearing…' : 'Clear History'}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="dashboard-empty">
          <p>No scan history yet. Run a scan from the <Link href="/dashboard">dashboard</Link> to start tracking.</p>
        </div>
      ) : (
        <>
          {showChart && (
            <div style={{
              border: '1px solid rgba(100,116,139,0.2)',
              borderRadius: '8px',
              padding: '1.5rem 1rem 1rem',
              marginBottom: '1.5rem',
            }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(100,116,139,0.2)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[yMin, 100]}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '0.8125rem', color: '#94a3b8', paddingTop: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Final Score"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Config Score"
                    stroke="#64748b"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={{ r: 3, fill: '#64748b', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{
            border: '1px solid rgba(100,116,139,0.2)',
            borderRadius: '8px',
            overflowX: 'auto',
          }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'auto', width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, textAlign: 'left', minWidth: '175px' }}>Date</th>
                  <th style={{ ...thBase, textAlign: 'center', minWidth: '80px' }}>Score</th>
                  <th style={{ ...thBase, textAlign: 'center', minWidth: '70px' }}>Config</th>
                  <th style={{ ...thBase, textAlign: 'center', minWidth: '90px' }}>Reputation</th>
                  {presentChecks.map(check => (
                    <th key={check} style={{ ...thBase, textAlign: 'center', minWidth: '72px' }}>
                      {CHECK_LABELS[check]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => {
                  const prev = history[i + 1];
                  const trend = prev ? entry.finalScore - prev.finalScore : null;
                  const isLast = i === history.length - 1;
                  return (
                    <tr key={i}>
                      <td style={{ ...tdBase, color: '#94a3b8', fontSize: '0.8125rem', borderBottom: isLast ? 'none' : '1px solid rgba(100,116,139,0.08)' }}>
                        {formatDate(entry.ts)}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'center', fontWeight: 600, color: getScoreColor(entry.finalScore), borderBottom: isLast ? 'none' : '1px solid rgba(100,116,139,0.08)' }}>
                        {entry.finalScore}
                        {trend !== null && (
                          <span style={{
                            marginLeft: '0.3em',
                            fontSize: '0.75rem',
                            fontWeight: 400,
                            color: trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--danger)' : '#64748b',
                          }}>
                            {trend > 0 ? `↑${trend}` : trend < 0 ? `↓${Math.abs(trend)}` : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', borderBottom: isLast ? 'none' : '1px solid rgba(100,116,139,0.08)' }}>{entry.configScore}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', borderBottom: isLast ? 'none' : '1px solid rgba(100,116,139,0.08)' }}>{entry.reputationTier}</td>
                      {presentChecks.map(check => {
                        const score = entry.checks[check];
                        return (
                          <td key={check} style={{ ...tdBase, textAlign: 'center', color: score !== undefined ? getScoreColor(score) : '#475569', borderBottom: isLast ? 'none' : '1px solid rgba(100,116,139,0.08)' }}>
                            {score !== undefined ? score : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: '1rem', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.6 }}>
            <strong style={{ color: '#64748b' }}>Score</strong> is the final deliverability score after applying any blacklist penalty.{' '}
            <strong style={{ color: '#64748b' }}>Config</strong> is the raw weighted average of all infrastructure checks (SPF, DKIM, DMARC, etc.) before reputation is taken into account.
            A gap between the two means your configuration is solid but your mail server IPs have a reputation issue.
          </p>
        </>
      )}
    </div>
  );
}
