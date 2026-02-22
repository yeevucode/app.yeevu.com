'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckResult } from '../../lib/types/scanner';
import { CHECK_WEIGHTS, REPUTATION_MULTIPLIERS, ReputationTier } from '../../lib/constants/scoring';

// Score Ring Component (Dark Theme - Segmented bars style)
function ScoreRingDark({ score, status }: { score: number | null; status: string }) {
  const radius = 65;
  const centerX = 80;
  const centerY = 80;
  const strokeWidth = 10;
  const totalSegments = 10;
  const gapAngle = 6; // Gap between segments in degrees
  const totalGapAngle = gapAngle * totalSegments;
  const availableAngle = 360 - totalGapAngle;
  const segmentAngle = availableAngle / totalSegments;

  // Convert 0-100 score to 0-10 for display
  const displayScore = score !== null ? Math.round(score / 10) : null;
  const filledSegments = displayScore !== null ? displayScore : 0;

  // Create arc path for a segment
  const createArc = (startAngle: number, endAngle: number) => {
    // Convert to radians and adjust so 0 is at top
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Generate segments
  const segments = [];
  for (let i = 0; i < totalSegments; i++) {
    const startAngle = i * (segmentAngle + gapAngle);
    const endAngle = startAngle + segmentAngle;
    const isFilled = i < filledSegments;

    segments.push(
      <path
        key={i}
        d={createArc(startAngle, endAngle)}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={isFilled ? `ring-segment-filled ${status}` : 'ring-segment-empty'}
      />
    );
  }

  return (
    <div className="score-ring-dark">
      <svg viewBox="0 0 160 160">
        {segments}
      </svg>
      <div className="score-ring-dark-text">
        <div className="score-label-top">Score</div>
        <div className="score-number">{displayScore !== null ? displayScore : '...'}</div>
        <div className="score-max">of 10</div>
      </div>
    </div>
  );
}

// Traffic Light Status Card
function StatusCardDark({
  title,
  subtitle,
  status
}: {
  title: string;
  subtitle: string;
  status: 'pass' | 'warn' | 'fail' | 'loading';
}) {
  return (
    <div className="status-card-dark">
      <div className="traffic-lights">
        <div className={`traffic-dot ${status === 'fail' ? 'active red' : ''}`} />
        <div className={`traffic-dot ${status === 'warn' ? 'active yellow' : ''}`} />
        <div className={`traffic-dot ${status === 'pass' ? 'active green' : ''}`} />
      </div>
      <h4>{title}</h4>
      <p>{subtitle}</p>
    </div>
  );
}


// Copy Button Component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button className={`copy-button ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? '✓ Copied' : '📋 Copy'}
    </button>
  );
}

// Progress Bar Component
function ProgressBar({ value, max, status }: { value: number; max: number; status: 'good' | 'warning' | 'danger' }) {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="progress-bar">
      <div
        className={`progress-bar-fill ${status}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// Helper type for accessing details - allows flexible property access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Details = Record<string, any>;

// Helper to safely get details with proper typing
function getDetails(result: CheckResult | null | undefined): Details {
  return (result?.details || {}) as Details;
}

type CheckType = 'mx' | 'spf' | 'dkim' | 'dmarc' | 'smtp' | 'blacklist' | 'compliance' | 'mta_sts' | 'tls_rpt' | 'bimi_record' | 'bimi_vmc';

interface CheckState {
  result: CheckResult | null;
  loading: boolean;
  error: string | null;
}

type ChecksState = Record<CheckType, CheckState>;

const initialCheckState: CheckState = {
  result: null,
  loading: true,
  error: null,
};

const ALL_CHECKS: CheckType[] = ['dmarc', 'spf', 'dkim', 'mx', 'smtp', 'blacklist', 'compliance', 'mta_sts', 'tls_rpt', 'bimi_record', 'bimi_vmc'];
const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const apiPath = (path: string) => `${API_BASE}${path}`;

function CheckCard({
  title,
  icon,
  result,
  checkType,
  loading = false,
}: {
  title: string;
  icon: string;
  result?: CheckResult | null;
  checkType: CheckType;
  loading?: boolean;
}) {
  const statusLabels = {
    pass: 'Pass',
    warn: 'Warning',
    fail: 'Fail',
  };

  const statusIcons = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
  };

  if (loading) {
    return (
      <div className="skeleton-card">
        <div className="skeleton-card-header">
          <div className="check-card-title">
            <span className="check-icon">{icon}</span>
            <h3>{title}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="status-badge" style={{ background: 'var(--gray-200)', color: 'var(--gray-600)' }}>
              Checking...
            </span>
          </div>
        </div>
        <div className="skeleton-card-body">
          <div className="skeleton skeleton-line long"></div>
          <div className="skeleton skeleton-line medium"></div>
          <div className="skeleton skeleton-line short"></div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  // Use helper for typed access to details
  const d = getDetails(result);

  return (
    <div className={`check-card status-${result.status}`}>
      <div className="check-card-header">
        <div className="check-card-title">
          <span className="check-icon">{icon}</span>
          <h3>{title}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
            {result.score}/100
          </span>
          <span className={`status-badge ${result.status}`}>
            <span className={`status-icon icon-animated ${result.status}`}>{statusIcons[result.status]}</span>
            {statusLabels[result.status]}
          </span>
        </div>
      </div>
      <div className="check-card-body">
        <div className="check-details">
          {/* MX Check Details */}
          {checkType === 'mx' && d && (
            <>
              {d.count !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">MX Records</span>
                  <span className="detail-value">
                    {d.count} found ({d.valid_count} valid)
                  </span>
                </div>
              )}
              {d.mx_records?.map((mx: { exchange: string; priority: number; resolves: boolean }, idx: number) => (
                <div className="detail-row" key={idx}>
                  <span className="detail-label">Priority {mx.priority}</span>
                  <span className="detail-value">
                    {mx.exchange} {mx.resolves ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* SPF Check Details */}
          {checkType === 'spf' && d && (
            <>
              <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="detail-label">Record Found</span>
                <span className={d.found && d.policy_qualifier === '-all' ? 'success-message' : d.found ? 'warning-message' : 'error-message'}>
                  {d.found
                    ? (d.policy_qualifier === '-all'
                        ? 'Great job! You have a valid SPF record, which specifies a hard fail (-all).'
                        : d.policy_qualifier === '~all'
                          ? 'Your domain has a valid SPF record with a soft fail (~all). Consider upgrading to hard fail (-all) for better protection.'
                          : 'Valid SPF record found.')
                    : 'No SPF record found.'}
                </span>
              </div>
              {d.found && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary>
                    Details
                  </summary>
                  <div style={{ marginTop: '0.75rem' }}>
                    {d.spf_record && (
                      <div style={{ marginBottom: '1rem' }}>
                        <span className="detail-label" style={{ display: 'block', marginBottom: '0.5rem' }}>SPF Record</span>
                        <div className="code-block">
                          <code>{d.spf_record}</code>
                          <CopyButton text={d.spf_record} />
                        </div>
                      </div>
                    )}
                    {d.lookup_count !== undefined && (
                      <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span className="detail-label">Total DNS Lookups</span>
                          <span className="detail-value" style={{ color: d.lookup_count > 10 ? 'var(--danger)' : d.lookup_count > 7 ? 'var(--warning)' : 'var(--success)' }}>
                            {d.lookup_count}/10
                            {d.lookup_count > 10 && ' (exceeds RFC limit!)'}
                          </span>
                        </div>
                        <ProgressBar
                          value={d.lookup_count}
                          max={10}
                          status={d.lookup_count > 10 ? 'danger' : d.lookup_count > 7 ? 'warning' : 'good'}
                        />
                      </div>
                    )}
                    {d.direct_lookups !== undefined && (
                      <div className="detail-row">
                        <span className="detail-label">Direct Lookups</span>
                        <span className="detail-value">{d.direct_lookups}</span>
                      </div>
                    )}
                    {d.includes && d.includes.length > 0 && (
                      <div className="detail-row">
                        <span className="detail-label">Includes</span>
                        <span className="detail-value">{d.includes.join(', ')}</span>
                      </div>
                    )}
                    {d.policy_qualifier && (
                      <div className="detail-row">
                        <span className="detail-label">Policy</span>
                        <span className="detail-value">
                          {d.policy_qualifier}
                        </span>
                      </div>
                    )}
                    {d.lookup_chain && d.lookup_chain.length > 1 && (
                      <details style={{ marginTop: '0.75rem' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '0.875rem' }}>
                          View lookup chain ({d.lookup_chain.length} records)
                        </summary>
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--gray-50)', borderRadius: '4px', fontSize: '0.8rem' }}>
                          {d.lookup_chain.map((item: { domain: string; lookups: number; mechanisms: string[] }, idx: number) => (
                            <div key={idx} style={{ marginBottom: '0.5rem' }}>
                              <strong>{item.domain}</strong>: {item.lookups} lookup(s)
                              {item.mechanisms.length > 0 && (
                                <div style={{ color: 'var(--gray-500)', marginLeft: '1rem' }}>
                                  {item.mechanisms.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </details>
              )}
            </>
          )}

          {/* DKIM Check Details */}
          {checkType === 'dkim' && d && (
            <>
              <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="detail-label">Keys Found</span>
                <span className={d.keys_found > 0 && d.found_keys?.every((key: { keyBits?: number }) => key.keyBits && key.keyBits >= 2048) ? 'success-message' : d.keys_found > 0 ? 'warning-message' : 'error-message'}>
                  {d.keys_found > 0
                    ? (d.found_keys?.every((key: { keyBits?: number }) => key.keyBits && key.keyBits >= 2048)
                        ? 'Great job! You have valid DKIM keys with strong encryption.'
                        : 'Your domain has DKIM keys but some use weak encryption. Consider upgrading to 2048-bit.')
                    : 'No DKIM keys found.'}
                </span>
              </div>
              {d.keys_found > 0 && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary>
                    Details
                  </summary>
                  <div style={{ marginTop: '0.75rem' }}>
                    <div className="detail-row">
                      <span className="detail-label">Total Keys</span>
                      <span className="detail-value">{d.keys_found}</span>
                    </div>
                    {d.found_keys?.map((key: { selector: string; keyBits?: number; keyAlgo?: string }) => {
                      const isEd25519 = key.keyAlgo === 'Ed25519';
                      const isWeak = !isEd25519 && key.keyBits !== undefined && key.keyBits < 2048;
                      const label = isEd25519
                        ? `Ed25519 (≡ 3000+ bit RSA)`
                        : `${key.keyBits}-bit ${key.keyAlgo ?? 'RSA'}`;
                      return (
                        <div className="detail-row" key={key.selector}>
                          <span className="detail-label">Selector: {key.selector}</span>
                          <span className="detail-value" style={{ color: isWeak ? 'var(--warning)' : 'inherit' }}>
                            {label}
                            {isWeak && ' (weak - upgrade to 2048-bit)'}
                          </span>
                        </div>
                      );
                    })}
                    {d.selectors_probed && (
                      <div className="detail-row">
                        <span className="detail-label">Selectors Checked</span>
                        <span className="detail-value">
                          {d.selectors_probed.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </>
          )}

          {/* DMARC Check Details */}
          {checkType === 'dmarc' && d && (
            <>
              <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="detail-label">Record Found</span>
                <span className={d.found && (d.policy === 'reject' || d.policy === 'quarantine') ? 'success-message' : d.found ? 'warning-message' : 'error-message'}>
                  {d.found
                    ? (d.policy === 'reject' || d.policy === 'quarantine'
                        ? 'Great job! You have a valid DMARC record with a strong policy.'
                        : 'Your domain has a valid DMARC record but the DMARC policy does not prevent abuse of your domain by phishers and spammers.')
                    : 'No DMARC record found.'}
                </span>
              </div>
              {d.found && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary>
                    Details
                  </summary>
                  <div style={{ marginTop: '0.75rem' }}>
                    {d.dmarc_record && (
                      <div style={{ marginBottom: '1rem' }}>
                        <span className="detail-label" style={{ display: 'block', marginBottom: '0.5rem' }}>DMARC Record</span>
                        <div className="code-block">
                          <code>{d.dmarc_record}</code>
                          <CopyButton text={d.dmarc_record} />
                        </div>
                      </div>
                    )}
                    {d.policy && (
                      <div className="detail-row">
                        <span className="detail-label">Policy</span>
                        <span className="detail-value">
                          p={d.policy}
                          {d.policy === 'none' && ' (monitoring only)'}
                          {d.policy === 'reject' && ' (strict)'}
                        </span>
                      </div>
                    )}
                    {d.has_rua !== undefined && (
                      <div className="detail-row">
                        <span className="detail-label">Aggregate Reports</span>
                        <span className="detail-value">
                          {d.has_rua ? 'Enabled (rua)' : 'Not configured'}
                        </span>
                      </div>
                    )}
                    {d.has_ruf !== undefined && (
                      <div className="detail-row">
                        <span className="detail-label">Forensic Reports</span>
                        <span className="detail-value">
                          {d.has_ruf ? 'Enabled (ruf)' : 'Not configured'}
                        </span>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </>
          )}

          {/* SMTP Check Details - Updated to show servers without connectivity test */}
          {checkType === 'smtp' && d && (
            <>
              {d.server_count !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Mail Servers</span>
                  <span className="detail-value">
                    {d.server_count} configured
                  </span>
                </div>
              )}
              {d.has_redundancy !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Redundancy</span>
                  <span className="detail-value">
                    {d.has_redundancy ? '✓ Multiple servers' : '⚠ Single server'}
                  </span>
                </div>
              )}
              {d.servers?.map((server: { hostname: string; priority: number; ip: string }, idx: number) => (
                <div className="detail-row" key={idx}>
                  <span className="detail-label">Priority {server.priority}</span>
                  <span className="detail-value">
                    {server.hostname}
                    <br />
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      {server.ip}
                    </span>
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Blacklist Check Details */}
          {checkType === 'blacklist' && d && (
            d.check_error ? (
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value" style={{ color: 'var(--gray-500)' }}>
                  Check unavailable — no penalty applied
                </span>
              </div>
            ) : (
              <>
                <div className="detail-row">
                  <span className="detail-label">IPs Checked</span>
                  <span className="detail-value">{d.ips_checked ?? 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Blacklists Checked</span>
                  <span className="detail-value">{d.blacklists_checked ?? 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    {d.all_clear
                      ? '✓ All clear - No blacklist listings found'
                      : `⚠ Found ${d.total_listings} listing(s)`}
                  </span>
                </div>
                {d.major_listings > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Major Listings</span>
                    <span className="detail-value" style={{ color: 'var(--danger)' }}>
                      {d.major_listings} (critical)
                    </span>
                  </div>
                )}
                {d.minor_listings > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Minor Listings</span>
                    <span className="detail-value" style={{ color: 'var(--warning)' }}>
                      {d.minor_listings}
                    </span>
                  </div>
                )}
              </>
            )
          )}

          {/* MTA-STS Check Details */}
          {checkType === 'mta_sts' && d && (
            <>
              <div className="detail-row">
                <span className="detail-label">Record Found</span>
                <span className="detail-value">
                  {d.has_record ? 'Yes' : 'No'}
                </span>
              </div>
              {d.txt_record && (
                <div className="detail-row">
                  <span className="detail-label">TXT Record</span>
                  <span className="detail-value">{d.txt_record}</span>
                </div>
              )}
              {d.policy && (
                <>
                  <div className="detail-row">
                    <span className="detail-label">Mode</span>
                    <span className="detail-value">
                      {d.policy.mode}
                      {d.policy.mode === 'enforce' && ' (strict)'}
                      {d.policy.mode === 'testing' && ' (test only)'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Max Age</span>
                    <span className="detail-value">
                      {d.policy.max_age_days} days
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* TLS-RPT Check Details */}
          {checkType === 'tls_rpt' && d && (
            <>
              <div className="detail-row">
                <span className="detail-label">Record Found</span>
                <span className="detail-value">
                  {d.has_record ? 'Yes' : 'No'}
                </span>
              </div>
              {d.txt_record && (
                <div className="detail-row">
                  <span className="detail-label">TXT Record</span>
                  <span className="detail-value">{d.txt_record}</span>
                </div>
              )}
              {d.has_mailto !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Email Reports</span>
                  <span className="detail-value">
                    {d.has_mailto ? 'Enabled' : 'Not configured'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* BIMI Record Check Details */}
          {checkType === 'bimi_record' && d && (
            <>
              <div className="detail-row">
                <span className="detail-label">Record Found</span>
                <span className="detail-value">
                  {d.has_record ? 'Yes' : 'No'}
                </span>
              </div>
              {d.logo_url && (
                <div className="detail-row">
                  <span className="detail-label">Logo URL</span>
                  <span className="detail-value">
                    <a href={d.logo_url} target="_blank" rel="noopener noreferrer">
                      {d.logo_url.length > 50
                        ? d.logo_url.substring(0, 50) + '...'
                        : d.logo_url}
                    </a>
                  </span>
                </div>
              )}
              {d.has_vmc !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">VMC Certificate</span>
                  <span className="detail-value">
                    {d.has_vmc ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* BIMI VMC Check Details */}
          {checkType === 'bimi_vmc' && d && (
            <>
              <div className="detail-row">
                <span className="detail-label">VMC Configured</span>
                <span className="detail-value">
                  {d.has_vmc ? 'Yes' : 'No'}
                </span>
              </div>
              {d.vmc_url && (
                <div className="detail-row">
                  <span className="detail-label">VMC URL</span>
                  <span className="detail-value">
                    <a href={d.vmc_url} target="_blank" rel="noopener noreferrer">
                      View Certificate
                    </a>
                  </span>
                </div>
              )}
              {d.vmc_is_pem !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Valid PEM</span>
                  <span className="detail-value">
                    {d.vmc_is_pem ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Compliance Check Details */}
          {checkType === 'compliance' && d && (
            <>
              <div className="detail-row">
                <span className="detail-label">Privacy Page</span>
                <span className="detail-value">{d.privacyFound ? '✓ Found' : '✗ Not found'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Terms Page</span>
                <span className="detail-value">{d.termsFound ? '✓ Found' : '✗ Not found'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Consent Signal</span>
                <span className="detail-value">{d.consentFound ? '✓ Detected' : '✗ Not detected'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Subscription Form</span>
                <span className="detail-value">{d.subscriptionFound ? '✓ Detected' : 'Not detected'}</span>
              </div>
            </>
          )}

          {result.error && !result.details?.error && (
            <div className="detail-row">
              <span className="detail-label">Error</span>
              <span className="detail-value">{result.error}</span>
            </div>
          )}
        </div>

        {result.recommendations && result.recommendations.length > 0 && (
          <div className="recommendations">
            <h4>Recommendations</h4>
            <ul>
              {result.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain');


  const [preflightReady, setPreflightReady] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Project save state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [projectLimits, setProjectLimits] = useState<{ current: number; limit: number | null; canAdd: boolean } | null>(null);

  const [checks, setChecks] = useState<ChecksState>(() => {
    const initial: ChecksState = {} as ChecksState;
    for (const check of ALL_CHECKS) {
      initial[check] = { ...initialCheckState };
    }
    return initial;
  });

  const [scanId] = useState(() => `scan_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`);

  // Calculate overall score from weighted checks then apply reputation multiplier.
  // Blacklist is NOT in CHECK_WEIGHTS — it applies as a post-calculation multiplier.
  // See wave ordering comment for why the late drop is intentional UX.
  const calculateScore = useCallback((): { configScore: number | null; finalScore: number | null; multiplier: number; reputationTier: ReputationTier | null } => {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const [check, weight] of Object.entries(CHECK_WEIGHTS)) {
      const checkState = checks[check as CheckType];
      if (checkState?.result) {
        weightedScore += checkState.result.score * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return { configScore: null, finalScore: null, multiplier: 1.0, reputationTier: null };

    const configScore = Math.round(weightedScore / totalWeight);

    const blacklistResult = checks.blacklist?.result;
    if (!blacklistResult || blacklistResult.details?.check_error) {
      // Blacklist not yet loaded or errored — show raw config score, no penalty
      return { configScore, finalScore: configScore, multiplier: 1.0, reputationTier: null };
    }

    const tier = (blacklistResult.details?.reputation_tier as ReputationTier) ?? 'unknown';
    const multiplier = REPUTATION_MULTIPLIERS[tier] ?? 1.0;
    const finalScore = Math.round(configScore * multiplier);

    return { configScore, finalScore, multiplier, reputationTier: tier };
  }, [checks]);

  const { configScore, finalScore: score, multiplier: reputationMultiplier, reputationTier } = calculateScore();

  // Check if user is authenticated and if domain is already saved
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(apiPath('/api/projects'));
        if (res.status === 401) {
          setIsAuthenticated(false);
          return;
        }
        if (res.ok) {
          setIsAuthenticated(true);
          const data = await res.json();
          setProjectLimits(data.limits);
          // Check if current domain is already saved
          const saved = data.projects.some(
            (p: { domain: string }) => p.domain.toLowerCase() === domain?.toLowerCase()
          );
          setIsSaved(saved);
        }
      } catch {
        setIsAuthenticated(false);
      }
    };
    if (domain) {
      checkAuth();
    }
  }, [domain]);

  // Save domain as project
  const saveAsProject = async () => {
    if (!domain || !isAuthenticated || isSaved) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      // Collect current scan results
      const scanResults: Record<string, { status: string; score: number }> = {};
      for (const [checkType, state] of Object.entries(checks)) {
        if (state.result) {
          scanResults[checkType] = {
            status: state.result.status,
            score: state.result.score,
          };
        }
      }

      const scanResult = {
        timestamp: new Date().toISOString(),
        overallScore: score || 0,
        results: scanResults,
      };

      const res = await fetch(apiPath('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, scanResult }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || 'Failed to save project');
        return;
      }

      setIsSaved(true);
      setProjectLimits(data.limits);
    } catch {
      setSaveError('Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch a single check
  const fetchCheck = useCallback(async (checkType: CheckType) => {
    if (!domain) return;

    try {
      const response = await fetch(apiPath(`/api/scan/${checkType}?domain=${encodeURIComponent(domain)}`));
      const data = await response.json();

      setChecks(prev => ({
        ...prev,
        [checkType]: {
          result: data.result,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        [checkType]: {
          result: null,
          loading: false,
          error: String(error),
        },
      }));
    }
  }, [domain]);


  // Preflight: validate domain and blocklist before firing checks
  useEffect(() => {
    setPreflightReady(false);
    setBlockedMessage(null);
    setPreflightError(null);
    setLimitReached(false);

    if (!domain) return;

    let cancelled = false;

    const runPreflight = async () => {
      try {
        const response = await fetch(apiPath(`/api/scan/preflight?domain=${encodeURIComponent(domain)}`));
        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.status === 403 && data?.blocked) {
          setBlockedMessage(data?.error || 'Unable to complete scan for this domain');
          setPreflightReady(true);
          return;
        }

        if (response.status === 403 && data?.limitReached) {
          setLimitReached(true);
          setPreflightReady(true);
          return;
        }

        if (!response.ok) {
          setPreflightError(data?.error || 'Unable to validate domain');
          setPreflightReady(true);
          return;
        }

        setPreflightReady(true);
      } catch {
        if (cancelled) return;
        setPreflightError('Unable to validate domain');
        setPreflightReady(true);
      }
    };

    runPreflight();

    return () => {
      cancelled = true;
    };
  }, [domain]);

  // Fetch all checks progressively
  useEffect(() => {
    if (!domain || !preflightReady || blockedMessage || preflightError || limitReached) return;

    // Save to recent scans in localStorage
    try {
      const recentScans = JSON.parse(localStorage.getItem('recentScans') || '[]');
      const existing = recentScans.find((s: { domain: string }) => s.domain === domain);
      if (!existing) {
        const newScan = { domain, score: 0, timestamp: new Date().toISOString() };
        localStorage.setItem('recentScans', JSON.stringify([newScan, ...recentScans].slice(0, 10)));
      }
    } catch {
      // localStorage not available
    }

    // INTENTIONAL WAVE ORDERING — do not reorder without understanding the UX.
    //
    // Wave 1 (core checks): runs immediately to populate the score ring progressively.
    // Watching the score build as checks complete is deliberate gamification — it keeps
    // the user engaged and anchors them to a high configuration score before blacklist runs.
    //
    // Wave 2 (advanced checks): non-scoring supplementary checks, fired with a brief delay
    // so core checks get priority bandwidth.
    //
    // Wave 3 (blacklist + compliance): runs last deliberately. When a blacklist listing is
    // found, the score drops visibly after the user has already seen a high config score.
    // This late drop communicates the severity of a reputation listing far more effectively
    // than a static warning would. Do not move blacklist to Wave 1.
    const corePriority: CheckType[] = ['dmarc', 'spf', 'dkim', 'mx', 'smtp'];
    const advancedPriority: CheckType[] = ['mta_sts', 'tls_rpt', 'bimi_record', 'bimi_vmc'];
    const lastPriority: CheckType[] = ['blacklist', 'compliance'];

    // Start core checks immediately
    corePriority.forEach(check => fetchCheck(check));

    // Start advanced checks after a small delay
    setTimeout(() => {
      advancedPriority.forEach(check => fetchCheck(check));
    }, 100);

    // Start blacklist + compliance last (slow checks, blacklist drop is intentional)
    setTimeout(() => {
      lastPriority.forEach(check => fetchCheck(check));
    }, 200);

  }, [domain, fetchCheck, preflightReady, blockedMessage, preflightError, limitReached]);

  // Update localStorage with score when it changes
  useEffect(() => {
    if (score !== null && domain && preflightReady && !blockedMessage && !preflightError && !limitReached) {
      try {
        const recentScans = JSON.parse(localStorage.getItem('recentScans') || '[]');
        const updated = recentScans.map((s: { domain: string; score: number; timestamp: string }) =>
          s.domain === domain ? { ...s, score, timestamp: new Date().toISOString() } : s
        );
        localStorage.setItem('recentScans', JSON.stringify(updated));
      } catch {
        // localStorage not available
      }
    }
  }, [score, domain, preflightReady, blockedMessage, preflightError, limitReached]);

  if (!domain) {
    return (
      <div className="error">

        <div className="error-icon">❓</div>
        <h2>No Domain Specified</h2>
        <p>Please enter a domain to check.</p>
        <Link href="/" className="back-link">
          ← Check a Domain
        </Link>
      </div>
    );
  }


  if (!preflightReady) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Validating domain...</p>
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="error">
        <div className="error-icon">!</div>
        <h2>Domain Blocked</h2>
        <p>{blockedMessage}</p>
        <Link href="/" className="back-link">
          &larr; Check a Domain
        </Link>
      </div>
    );
  }

  if (preflightError) {
    return (
      <div className="error">
        <div className="error-icon">!</div>
        <h2>Unable to Start Scan</h2>
        <p>{preflightError}</p>
        <Link href="/" className="back-link">
          &larr; Check a Domain
        </Link>
      </div>
    );
  }

  if (limitReached) {
    return (
      <div className="error">
        <div className="error-icon" style={{ fontSize: '3rem' }}>🔒</div>
        <h2>Daily Limit Reached</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          You&apos;ve reached your daily scan limit.<br />
          Sign in for unlimited domain scans.
        </p>
        <a
          href={apiPath('/api/auth/login')}
          className="search-button"
          style={{
            display: 'inline-block',
            textDecoration: 'none',
            marginBottom: '1rem',
          }}
        >
          Sign in to Continue
        </a>
        <br />
        <Link href="/" className="back-link">
          &larr; Check a Different Domain
        </Link>
      </div>
    );
  }

  const getScoreStatus = (score: number | null) => {
    if (score === null) return 'loading';
    if (score >= 70) return 'pass';
    if (score >= 40) return 'warn';
    return 'fail';
  };

  // Collect all issues from completed checks
  const issues: Array<{ severity: 'error' | 'warning' | 'info'; check: string; title: string; description: string; remediation?: string }> = [];

  // Add issues based on check results
  for (const [checkType, state] of Object.entries(checks)) {
    if (!state.result) continue;
    const result = state.result;

    if (checkType === 'dmarc' && result.status === 'fail') {
      issues.push({
        severity: 'warning',
        check: 'dmarc',
        title: 'No DMARC policy',
        description: 'DMARC record not found',
        remediation: `Add a DMARC policy at _dmarc.${domain}`,
      });
    }
    if (checkType === 'spf' && result.status === 'fail') {
      issues.push({
        severity: 'error',
        check: 'spf',
        title: 'No SPF record found',
        description: 'SPF record not found for this domain',
        remediation: 'Add an SPF record to authorize mail senders',
      });
    }
    if (checkType === 'dkim' && result.status === 'fail') {
      issues.push({
        severity: 'error',
        check: 'dkim',
        title: 'No DKIM keys found',
        description: 'No DKIM public keys discovered',
        remediation: 'Generate and publish DKIM keys',
      });
    }
    if (checkType === 'dkim' && result.status === 'warn' && result.details?.found_keys) {
      const details = result.details as Record<string, unknown>;
      const foundKeys = details.found_keys as Array<{ keyBits?: number }>;
      const weakKeys = foundKeys.filter((k) => k.keyBits && k.keyBits < 2048);
      if (weakKeys.length > 0) {
        issues.push({
          severity: 'warning',
          check: 'dkim',
          title: 'Weak DKIM keys detected',
          description: `${weakKeys.length} key(s) using less than 2048-bit encryption`,
          remediation: 'Upgrade to 2048-bit RSA or Ed25519 keys for better security',
        });
      }
    }
    if (checkType === 'blacklist' && result.status === 'fail') {
      issues.push({
        severity: 'error',
        check: 'blacklist',
        title: 'IP Blacklisted',
        description: `Mail server IP(s) found on ${result.details?.major_listings || 0} major blacklist(s)`,
        remediation: 'Request delisting from each blacklist provider',
      });
    }
  }

  const severityColors = {
    error: 'var(--danger)',
    warning: 'var(--warning)',
    info: 'var(--primary)',
  };

  // Get risk level based on score
  const getRiskLevel = (score: number | null) => {
    if (score === null) return { level: 'Analyzing...', class: 'medium' };
    if (score >= 70) return { level: 'Low', class: 'low' };
    if (score >= 40) return { level: 'Medium', class: 'medium' };
    return { level: 'High', class: 'high' };
  };

  const getRiskMessage = (score: number | null) => {
    if (score === null) return 'Analyzing your domain security configuration...';
    if (score >= 70) return 'Your email authentication is well configured. Minor improvements may be available.';
    if (score >= 40) return 'A medium security risk level signals notable SPF, DKIM, and DMARC issues, posing a potential risk of email spoofing; prompt resolution is recommended to strengthen overall security.';
    return 'Critical security issues detected. Your domain is vulnerable to email spoofing and phishing attacks. Immediate action is required.';
  };

  // Get DMARC policy from results
  const dmarcPolicy = checks.dmarc.result?.details?.policy as string || 'none';
  const riskInfo = getRiskLevel(score);

  return (
    <div className="results-dark">
      <div className="results-dark-content">
        {/* Back Navigation */}
        <Link href="/" className="back-nav">
          ← Scan another domain
        </Link>

        {/* Risk Assessment Banner */}
        <div className="risk-banner">
          <div className="risk-banner-title">
            Risk Assessment Level: <span className={`risk-level-${riskInfo.class}`}>{riskInfo.level}</span>
          </div>
          <p className="risk-banner-desc">{getRiskMessage(score)}</p>
        </div>

        {/* Overview Row */}
        <div className="result-overview-row">
          <div className="result-overview-left">
            <span>Overall result</span>
            <span className="info-icon">i</span>
          </div>
          <div className="policy-badge">
            <span>DMARC Policy:</span>
            <span className={`policy-tag ${dmarcPolicy}`}>
              {checks.dmarc.loading ? '...' : dmarcPolicy || 'None'}
            </span>
          </div>
        </div>

        {/* Score and Status Cards */}
        <div className="score-cards-row">
          <ScoreRingDark score={score} status={getScoreStatus(score)} />

          <div className="status-cards-grid">
            <StatusCardDark
              title="DMARC"
              subtitle="Domain-based Message Authentication, Reporting and Conformance"
              status={checks.dmarc.loading ? 'loading' : (checks.dmarc.result?.status || 'fail') as 'pass' | 'warn' | 'fail'}
            />
            <StatusCardDark
              title="SPF"
              subtitle="Sender Policy Framework"
              status={checks.spf.loading ? 'loading' : (checks.spf.result?.status || 'fail') as 'pass' | 'warn' | 'fail'}
            />
            <StatusCardDark
              title="DKIM"
              subtitle="DomainKeys Identified Mail"
              status={checks.dkim.loading ? 'loading' : (checks.dkim.result?.status || 'fail') as 'pass' | 'warn' | 'fail'}
            />
          </div>
        </div>

        {/* Reputation Impact Banner — shown when blacklist multiplier drops the score */}
        {reputationMultiplier < 1.0 && configScore !== null && score !== null && (
          <div style={{
            margin: '1rem 0',
            padding: '0.875rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.9rem',
          }}>
            <strong style={{ color: '#f87171' }}>Reputation Penalty Applied</strong>
            {' '}— Configuration score was {configScore}, reduced to {score} due to a blacklist listing.
            See the Blacklist Check below for details.
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons-row">
          <a href="#details" className="action-btn-dark primary">See Details</a>
          <a
            href="https://cal.com/tkwebhosts/free-30-minute-consultation"
            target="_blank"
            rel="noopener noreferrer"
            className="action-btn-dark secondary"
          >
            Fix My Domain Now
          </a>
          {/* Save as Project */}
          {isAuthenticated === true && (
            isSaved ? (
              <span className="saved-badge">✓ Saved to Projects</span>
            ) : projectLimits && !projectLimits.canAdd ? (
              <Link href="/dashboard" className="action-btn-dark secondary">
                Manage Projects
              </Link>
            ) : (
              <button
                onClick={saveAsProject}
                disabled={isSaving || score === null}
                className="save-project-btn"
              >
                {isSaving ? 'Saving...' : '+ Save as Project'}
              </button>
            )
          )}
          {isAuthenticated === false && (
            <a href={apiPath('/api/auth/login')} className="action-btn-dark secondary">
              Sign in to save
            </a>
          )}
        </div>
        {saveError && (
          <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.5rem', textAlign: 'right' }}>
            {saveError}
          </p>
        )}

        {/* Domain Info */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '8px' }}>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            <strong style={{ color: '#fff' }}>{domain}</strong> • Scan ID: {scanId} • {new Date().toLocaleString()}
          </p>
        </div>

      {/* Issues List */}
      <div id="details"></div>
      {issues.length > 0 && (
        <div className="issues-card" style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <h3 style={{ color: '#fff', fontSize: '1.125rem', fontWeight: 600 }}>Issues Found ({issues.length})</h3>
          </div>
          {issues.map((issue, idx) => (
            <div key={idx} className="issue-item" style={{ borderLeftColor: severityColors[issue.severity] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#fff' }}>{issue.title}</strong>
                <span style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  color: severityColors[issue.severity],
                  fontWeight: 600,
                }}>
                  {issue.check.toUpperCase().replace('_', '-')}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {issue.description}
              </p>
              {issue.remediation && (
                <p style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                  <strong>Fix:</strong> {issue.remediation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Core Email Authentication Checks */}
      <div className="section-divider">
        <h2><span className="section-icon">🔐</span> Core Authentication</h2>
      </div>
      <div className="check-cards">
        <CheckCard title="DMARC" icon="📋" result={checks.dmarc.result} checkType="dmarc" loading={checks.dmarc.loading} />
        <CheckCard title="SPF" icon="🛡️" result={checks.spf.result} checkType="spf" loading={checks.spf.loading} />
        <CheckCard title="DKIM" icon="🔐" result={checks.dkim.result} checkType="dkim" loading={checks.dkim.loading} />
        <CheckCard title="MX Records" icon="📬" result={checks.mx.result} checkType="mx" loading={checks.mx.loading} />
        <CheckCard title="SMTP Servers" icon="🔌" result={checks.smtp.result} checkType="smtp" loading={checks.smtp.loading} />
        <CheckCard title="Blacklist Check" icon="🚫" result={checks.blacklist.result} checkType="blacklist" loading={checks.blacklist.loading} />
      </div>

      {/* Advanced Email Security Checks */}
      <div className="section-divider">
        <h2><span className="section-icon">🛡️</span> Advanced Security</h2>
      </div>
      <div className="check-cards">
        <CheckCard title="MTA-STS" icon="🔒" result={checks.mta_sts.result} checkType="mta_sts" loading={checks.mta_sts.loading} />
        <CheckCard title="TLS-RPT" icon="📊" result={checks.tls_rpt.result} checkType="tls_rpt" loading={checks.tls_rpt.loading} />
      </div>

      {/* Brand Indicators */}
      <div className="section-divider">
        <h2><span className="section-icon">🎨</span> Brand Indicators (BIMI)</h2>
      </div>
      <div className="check-cards">
        <CheckCard title="BIMI Record" icon="🖼️" result={checks.bimi_record.result} checkType="bimi_record" loading={checks.bimi_record.loading} />
        <CheckCard title="BIMI VMC Certificate" icon="🏅" result={checks.bimi_vmc.result} checkType="bimi_vmc" loading={checks.bimi_vmc.loading} />
      </div>

      {/* Compliance */}
      <div className="section-divider">
        <h2><span className="section-icon">📋</span> Compliance</h2>
      </div>
      <div className="check-cards">
        <CheckCard title="Compliance" icon="✅" result={checks.compliance.result} checkType="compliance" loading={checks.compliance.loading} />
      </div>

      {/* Consultation CTA */}
      <div className="cta-section">
        <h3>Need Help with Implementation?</h3>
        <p>Get expert assistance setting up SPF, DKIM, DMARC, and more for your domain.</p>
        <a
          href="https://cal.com/tkwebhosts/free-30-minute-consultation"
          target="_blank"
          rel="noopener noreferrer"
          className="action-btn-dark primary"
        >
          Book Free Consultation
        </a>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <Link href="/" className="back-nav" style={{ display: 'inline-flex' }}>
          ← Check Another Domain
        </Link>
      </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
