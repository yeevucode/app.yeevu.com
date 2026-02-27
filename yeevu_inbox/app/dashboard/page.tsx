'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ORDERED_CHECKS, CHECK_WEIGHTS, BLACKLIST_PENALTIES } from '../../lib/constants/scoring';

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

interface ProjectScanResult {
  timestamp: string;
  overallScore: number;
  results: Record<string, {
    status: string;
    score: number;
  }>;
}

interface ScanHistoryEntry {
  ts: string;
  finalScore: number;
  configScore: number;
  reputationTier: string;
  checks: Record<string, number>;
}

interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;
  scanHistory?: ScanHistoryEntry[];
  folder?: string;
}

interface ProjectLimits {
  current: number;
  limit: number | null;
  canAdd: boolean;
  tier: 'free' | 'growth' | 'scale' | 'enterprise';
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [limits, setLimits] = useState<ProjectLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningDomain, setScanningDomain] = useState<string | null>(null);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [movingDomain, setMovingDomain] = useState<string | null>(null);
  const [pendingNewFolder, setPendingNewFolder] = useState<{ domain: string } | null>(null);
  const [newFolderInput, setNewFolderInput] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const router = useRouter();

  const toggleFolder = (key: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch(apiPath('/api/projects'));
      if (res.status === 401) {
        router.push(apiPath('/api/auth/login?returnTo=/dashboard'));
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to load projects');
      }
      const data = await res.json();
      setProjects(data.projects);
      setLimits(data.limits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const removeProject = async (domain: string) => {
    if (!confirm(`Remove ${domain} from your projects?`)) return;

    setRemovingDomain(domain);
    try {
      const res = await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}`), {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to remove project');
      }
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove project');
    } finally {
      setRemovingDomain(null);
    }
  };

  const rescanProject = async (domain: string) => {
    setScanningDomain(domain);
    try {
      const results: Record<string, { status: string; score: number }> = {};
      const checkScores: Record<string, number> = {};
      const rawResults: Record<string, { result?: { status?: string; score?: number; details?: Record<string, unknown> } }> = {};

      await Promise.all(
        ORDERED_CHECKS.map(async (check) => {
          const res = await fetch(apiPath(`/api/scan/${check}?domain=${encodeURIComponent(domain)}`));
          if (res.ok) {
            const data = await res.json();
            rawResults[check] = data;
            results[check] = {
              status: data.result?.status || 'fail',
              score: data.result?.score ?? 0,
            };
            checkScores[check] = data.result?.score ?? 0;
          }
        })
      );

      let totalScore = 0;
      let totalWeight = 0;
      for (const [check, weight] of Object.entries(CHECK_WEIGHTS)) {
        if (checkScores[check] !== undefined) {
          totalScore += checkScores[check] * weight;
          totalWeight += weight;
        }
      }

      const configScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
      const reputationTier = (rawResults['blacklist']?.result?.details?.reputation_tier as string) ?? 'unknown';
      const penalty = BLACKLIST_PENALTIES[reputationTier] ?? 0;
      const overallScore = Math.max(0, configScore - penalty);

      const timestamp = new Date().toISOString();
      const scanResult: ProjectScanResult = { timestamp, overallScore, results };

      // Store all checks in canonical order so history columns are consistent.
      const checks: Record<string, number> = {};
      for (const check of ORDERED_CHECKS) {
        checks[check] = checkScores[check] ?? 0;
      }

      const historyEntry: ScanHistoryEntry = {
        ts: timestamp,
        finalScore: overallScore,
        configScore,
        reputationTier,
        checks,
      };

      await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanResult, historyEntry }),
      });

      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanningDomain(null);
    }
  };

  const moveProject = async (domain: string, folder: string | undefined) => {
    setMovingDomain(domain);
    try {
      const res = await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      if (!res.ok) throw new Error('Failed to move project');
      setPendingNewFolder(null);
      setNewFolderInput('');
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move project');
    } finally {
      setMovingDomain(null);
    }
  };

  const handleMoveSelect = (domain: string, value: string) => {
    if (value === '__new__') {
      setPendingNewFolder({ domain });
      setNewFolderInput('');
      return;
    }
    moveProject(domain, value || undefined);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'var(--success)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Good';
    if (score >= 40) return 'Needs Work';
    return 'Poor';
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

  const isOverLimit = !!limits && limits.limit !== null && limits.current > limits.limit;
  const nextTierLabel = limits?.tier === 'free' ? 'Growth' : limits?.tier === 'growth' ? 'Scale' : 'Enterprise';

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading your projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="search-button">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>My Projects</h1>
          <p className="dashboard-subtitle">
            Track and monitor email deliverability for your domains
          </p>
        </div>
        {limits && (
          <div className="property-limits">
            <span className="limit-count" style={
              limits.limit !== null && limits.current > limits.limit
                ? { color: '#ef4444' }
                : undefined
            }>
              {limits.current} / {limits.limit ?? '∞'}
            </span>
            <span className="limit-label">projects</span>
            {limits.tier !== 'free' && (
              <span style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                marginLeft: 8,
                background: limits.tier === 'enterprise' ? '#a855f722' : limits.tier === 'scale' ? '#8b5cf622' : '#3b82f622',
                color: limits.tier === 'enterprise' ? '#a855f7' : limits.tier === 'scale' ? '#8b5cf6' : '#3b82f6',
                border: `1px solid ${limits.tier === 'enterprise' ? '#a855f744' : limits.tier === 'scale' ? '#8b5cf644' : '#3b82f644'}`,
                textTransform: 'uppercase' as const,
                letterSpacing: 0.5,
              }}>
                {limits.tier}
              </span>
            )}
          </div>
        )}
      </div>

      {isOverLimit && limits && (
        <div style={{
          margin: '0 0 1.5rem',
          padding: '1rem 1.25rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap' as const,
        }}>
          <span style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
            You have <strong>{limits.current}</strong> projects but your current plan allows <strong>{limits.limit}</strong>.
            Remove projects to continue, or upgrade to keep full access.
          </span>
          <a
            href="https://portal.tkwebhosts.com/store/yeevu-ai/email-deliverability-checker"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flexShrink: 0,
              padding: '0.375rem 0.875rem',
              background: '#ef4444',
              color: '#fff',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Upgrade to {nextTierLabel}
          </a>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="dashboard-empty">
          <div className="empty-icon">📭</div>
          <h2>No Projects Yet</h2>
          <p>
            Scan a domain and save it as a project to track its email deliverability over time.
          </p>
          <Link href="/" className="search-button">
            Scan a Domain
          </Link>
        </div>
      ) : (() => {
          const allFolders = [...new Set(projects.map(p => p.folder).filter(Boolean))] as string[];
          const grouped = projects.reduce((acc, p) => {
            const key = p.folder ?? '';
            (acc[key] ??= []).push(p);
            return acc;
          }, {} as Record<string, Project[]>);
          const folderKeys = Object.keys(grouped).sort((a, b) =>
            a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
          );

          return (
            <>
              {folderKeys.map(folderKey => {
                const isCollapsed = collapsedFolders.has(folderKey);
                return (
                <div key={folderKey} style={{ marginBottom: '2rem' }}>
                  {folderKeys.length > 1 && (
                    <button
                      onClick={() => toggleFolder(folderKey)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'none',
                        border: 'none',
                        padding: '0 0 0.875rem',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        transition: 'transform 0.15s',
                        display: 'inline-block',
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}>▾</span>
                      <span style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#64748b',
                      }}>
                        {folderKey || 'Uncategorised'}
                        <span style={{ fontWeight: 400, marginLeft: '0.4em', color: '#475569' }}>
                          ({grouped[folderKey].length})
                        </span>
                      </span>
                    </button>
                  )}
                  {!isCollapsed && <div className="properties-grid">
                    {grouped[folderKey].map((project) => (
                      <div key={project.domain} className="property-card">
                        <div className="property-header">
                          <h3 className="property-domain">{project.domain}</h3>
                          {project.lastScan && (
                            <div
                              className="property-score"
                              style={{ backgroundColor: getScoreColor(project.lastScan.overallScore) }}
                            >
                              {project.lastScan.overallScore}
                            </div>
                          )}
                        </div>

                        {project.lastScan ? (
                          <>
                            <div className="property-status">
                              <span
                                className="status-badge"
                                style={{ color: getScoreColor(project.lastScan.overallScore) }}
                              >
                                {getScoreLabel(project.lastScan.overallScore)}
                              </span>
                              <span className="scan-date">
                                Last scan: {formatDate(project.lastScan.timestamp)}
                              </span>
                            </div>

                            <div className="property-checks">
                              {ORDERED_CHECKS.filter(check => check in project.lastScan!.results).map((check) => {
                                const result = project.lastScan!.results[check];
                                return (
                                  <div
                                    key={check}
                                    className={`check-badge ${result.status}`}
                                    title={`${check.toUpperCase()}: ${result.score}/100`}
                                  >
                                    {check.toUpperCase()}
                                  </div>
                                );
                              })}
                            </div>

                            {(() => {
                              const history = project.scanHistory;
                              const latest = history?.[0];
                              const previous = history?.[1];
                              const trend = latest && previous
                                ? latest.finalScore - previous.finalScore
                                : null;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                                  {trend !== null && (
                                    <span style={{
                                      fontSize: '0.8125rem',
                                      color: trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--danger)' : '#64748b',
                                      fontWeight: 500,
                                    }}>
                                      {trend > 0 ? '↑' : trend < 0 ? '↓' : '—'}{trend !== 0 ? ` ${Math.abs(trend)} pts` : ' No change'}
                                    </span>
                                  )}
                                  <Link
                                    href={`/dashboard/projects/${encodeURIComponent(project.domain)}/history`}
                                    style={{
                                      marginLeft: 'auto',
                                      fontSize: '0.8125rem',
                                      color: '#64748b',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    View History →
                                  </Link>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="property-no-scan">
                            <p>No scan data yet</p>
                          </div>
                        )}

                        {/* Move to folder */}
                        <div style={{ margin: '0.75rem 0 0', padding: '0.75rem 0 0', borderTop: '1px solid rgba(100,116,139,0.15)' }}>
                          <label style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: '0.375rem' }}>
                            Folder
                          </label>
                          <select
                            value={project.folder ?? ''}
                            onChange={e => handleMoveSelect(project.domain, e.target.value)}
                            disabled={movingDomain === project.domain || isOverLimit}
                            style={{
                              width: '100%',
                              padding: '0.375rem 0.625rem',
                              background: 'rgba(30, 41, 59, 0.6)',
                              border: '1px solid rgba(100, 116, 139, 0.3)',
                              borderRadius: '5px',
                              color: '#cbd5e1',
                              fontSize: '0.8125rem',
                            }}
                          >
                            <option value="">No folder</option>
                            {allFolders.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                            <option value="__new__">New folder…</option>
                          </select>
                          {pendingNewFolder?.domain === project.domain && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <input
                                type="text"
                                value={newFolderInput}
                                onChange={e => setNewFolderInput(e.target.value)}
                                placeholder="Folder name"
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: '0.375rem 0.625rem',
                                  background: 'rgba(30, 41, 59, 0.8)',
                                  border: '1px solid rgba(100, 116, 139, 0.35)',
                                  borderRadius: '5px',
                                  color: '#e2e8f0',
                                  fontSize: '0.8125rem',
                                }}
                              />
                              <button
                                onClick={() => moveProject(project.domain, newFolderInput.trim())}
                                disabled={!newFolderInput.trim() || movingDomain === project.domain}
                                className="action-btn rescan"
                                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                              >
                                Move
                              </button>
                              <button
                                onClick={() => { setPendingNewFolder(null); setNewFolderInput(''); }}
                                className="action-btn remove"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="property-actions">
                          <Link
                            href={`/results?domain=${encodeURIComponent(project.domain)}`}
                            className="action-btn view"
                            aria-disabled={isOverLimit}
                            onClick={isOverLimit ? (e) => e.preventDefault() : undefined}
                            style={isOverLimit ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                          >
                            View Details
                          </Link>
                          <button
                            onClick={() => rescanProject(project.domain)}
                            disabled={scanningDomain === project.domain || isOverLimit}
                            className="action-btn rescan"
                          >
                            {scanningDomain === project.domain ? 'Scanning...' : 'Rescan'}
                          </button>
                          <button
                            onClick={() => removeProject(project.domain)}
                            disabled={removingDomain === project.domain}
                            className="action-btn remove"
                          >
                            {removingDomain === project.domain ? '...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>
                );
              })}
            </>
          );
        })()
      }

      {limits && !limits.canAdd && (
        <div className="upgrade-banner">
          <div className="upgrade-content">
            {limits.tier === 'free' ? (
              <>
                <h3>Upgrade to Save More Domains</h3>
                <p>Free accounts can save 1 domain. Upgrade to Premium (10 domains) or Unlimited.</p>
              </>
            ) : (
              <>
                <h3>Upgrade to Unlimited</h3>
                <p>Premium accounts can save up to 10 domains. Upgrade to Unlimited for no limit.</p>
              </>
            )}
          </div>
          <a href="#upgrade" className="search-button">
            Upgrade Now
          </a>
        </div>
      )}
    </div>
  );
}
