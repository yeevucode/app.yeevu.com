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

interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;
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
      // Fetch all scan results
      const checks = ['mx', 'spf', 'dkim', 'dmarc', 'smtp', 'blacklist'];
      const results: Record<string, { status: string; score: number }> = {};
      let totalScore = 0;
      let totalWeight = 0;

      const weights: Record<string, number> = {
        dmarc: 25,
        spf: 20,
        dkim: 20,
        mx: 20,
        smtp: 15,
      };

      await Promise.all(
        checks.map(async (check) => {
          const res = await fetch(apiPath(`/api/scan/${check}?domain=${encodeURIComponent(domain)}`));
          if (res.ok) {
            const data = await res.json();
            results[check] = {
              status: data.result?.status || 'fail',
              score: data.result?.score || 0,
            };
            const weight = weights[check] || 0;
            totalScore += (data.result?.score || 0) * weight;
            totalWeight += weight;
          }
        })
      );

      const overallScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

      // Update project with new scan result
      const scanResult: ProjectScanResult = {
        timestamp: new Date().toISOString(),
        overallScore,
        results,
      };

      await fetch(apiPath(`/api/projects/${encodeURIComponent(domain)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanResult }),
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
