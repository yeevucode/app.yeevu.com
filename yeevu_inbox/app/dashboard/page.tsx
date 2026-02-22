'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  checks: {
    dmarc: number;
    spf: number;
    dkim: number;
    mx: number;
    smtp: number;
  };
}

interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;
  scanHistory?: ScanHistoryEntry[];
}

interface ProjectLimits {
  current: number;
  limit: number | null;
  canAdd: boolean;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [limits, setLimits] = useState<ProjectLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningDomain, setScanningDomain] = useState<string | null>(null);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const router = useRouter();

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
      const coreChecks = ['mx', 'spf', 'dkim', 'dmarc', 'smtp'];
      const allChecks = [...coreChecks, 'blacklist'];
      const results: Record<string, { status: string; score: number }> = {};
      const checkScores: Record<string, number> = {};

      const weights: Record<string, number> = {
        dmarc: 30, spf: 25, dkim: 25, mx: 10, smtp: 10,
      };

      const reputationMultipliers: Record<string, number> = {
        clean: 1.0, minor_only: 0.85, major: 0.5, multi_major: 0.25, unknown: 1.0,
      };

      await Promise.all(
        allChecks.map(async (check) => {
          const res = await fetch(apiPath(`/api/scan/${check}?domain=${encodeURIComponent(domain)}`));
          if (res.ok) {
            const data = await res.json();
            results[check] = {
              status: data.result?.status || 'fail',
              score: data.result?.score || 0,
            };
            checkScores[check] = data.result?.score || 0;
          }
        })
      );

      let totalScore = 0;
      let totalWeight = 0;
      for (const check of coreChecks) {
        if (checkScores[check] !== undefined) {
          totalScore += checkScores[check] * (weights[check] || 0);
          totalWeight += weights[check] || 0;
        }
      }

      const configScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
      const blacklistResult = results['blacklist'];
      const reputationTier = blacklistResult ? 'clean' : 'unknown';
      const multiplier = reputationMultipliers[reputationTier] ?? 1.0;
      const overallScore = Math.round(configScore * multiplier);

      const timestamp = new Date().toISOString();
      const scanResult: ProjectScanResult = { timestamp, overallScore, results };

      const historyEntry: ScanHistoryEntry = {
        ts: timestamp,
        finalScore: overallScore,
        configScore,
        reputationTier,
        checks: {
          dmarc: checkScores['dmarc'] ?? 0,
          spf: checkScores['spf'] ?? 0,
          dkim: checkScores['dkim'] ?? 0,
          mx: checkScores['mx'] ?? 0,
          smtp: checkScores['smtp'] ?? 0,
        },
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
            <span className="limit-count">
              {limits.current} / {limits.limit ?? '∞'}
            </span>
            <span className="limit-label">projects</span>
          </div>
        )}
      </div>

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
      ) : (
        <div className="properties-grid">
          {projects.map((project) => (
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
                    {Object.entries(project.lastScan.results).map(([check, result]) => (
                      <div
                        key={check}
                        className={`check-badge ${result.status}`}
                        title={`${check.toUpperCase()}: ${result.score}/100`}
                      >
                        {check.toUpperCase()}
                      </div>
                    ))}
                  </div>

                  {project.scanHistory && project.scanHistory.length > 1 && (
                    <div className="scan-history">
                      <div className="scan-history-title">Scan History</div>
                      <table className="scan-history-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Score</th>
                            <th>Config</th>
                            <th>Reputation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {project.scanHistory.slice(0, 10).map((entry, i) => (
                            <tr key={i}>
                              <td>{formatDate(entry.ts)}</td>
                              <td style={{ color: getScoreColor(entry.finalScore) }}>{entry.finalScore}</td>
                              <td>{entry.configScore}</td>
                              <td>{entry.reputationTier}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="property-no-scan">
                  <p>No scan data yet</p>
                </div>
              )}

              <div className="property-actions">
                <Link
                  href={`/results?domain=${encodeURIComponent(project.domain)}`}
                  className="action-btn view"
                >
                  View Details
                </Link>
                <button
                  onClick={() => rescanProject(project.domain)}
                  disabled={scanningDomain === project.domain}
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
        </div>
      )}

      {limits && !limits.canAdd && (
        <div className="upgrade-banner">
          <div className="upgrade-content">
            <h3>Unlock Unlimited Projects</h3>
            <p>
              Free accounts are limited to {limits.limit} projects. Upgrade to track unlimited domains.
            </p>
          </div>
          <a href="#upgrade" className="search-button">
            Upgrade Now
          </a>
        </div>
      )}
    </div>
  );
}
