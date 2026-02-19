'use client';

import Link from 'next/link';
import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface RecentScan {
  domain: string;
  score: number;
  timestamp: string;
}

export default function HomePage() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Load recent scans from localStorage
    try {
      const saved = localStorage.getItem('recentScans');
      if (saved) {
        setRecentScans(JSON.parse(saved));
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;

    // Clean domain input (remove protocol, www, trailing slashes)
    let cleanDomain = domain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    cleanDomain = cleanDomain.replace(/^www\./, '');
    cleanDomain = cleanDomain.replace(/\/.*$/, '');

    setLoading(true);
    router.push(`/results?domain=${encodeURIComponent(cleanDomain)}`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'var(--success)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <>
      <section className="hero">
        <h1>Check Your Email Deliverability</h1>
        <p>
          Verify your domain&apos;s email authentication (SPF, DKIM, DMARC), MTA-STS, TLS-RPT, and BIMI
          configuration to ensure your emails reach the inbox, not spam.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="search-input"
            placeholder="Enter domain (e.g., example.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button type="submit" className="search-button" disabled={loading || !domain.trim()}>
            {loading ? 'Checking...' : 'Check Domain'}
          </button>
        </form>
      </section>

      {recentScans.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--gray-700)' }}>
            Recent Scans
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {recentScans.slice(0, 5).map((scan) => (
              <Link
                key={scan.domain}
                href={`/results?domain=${encodeURIComponent(scan.domain)}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'white',
                  border: '1px solid var(--gray-200)',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gray-200)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: getScoreColor(scan.score),
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  {scan.score}
                </span>
                <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>
                  {scan.domain}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="features">
        <div className="feature-card">
          <div className="feature-icon">📋</div>
          <h3>DMARC Check</h3>
          <p>
            Analyzes your DMARC policy configuration, alignment settings, and
            reporting addresses.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>SPF Check</h3>
          <p>
            Validates your Sender Policy Framework record to ensure only authorized
            servers can send emails on your behalf.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔐</div>
          <h3>DKIM Check</h3>
          <p>
            Verifies your DomainKeys Identified Mail configuration and key strength
            for email authentication.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📬</div>
          <h3>MX Records</h3>
          <p>
            Validates your Mail Exchange records to ensure email can be delivered
            to your domain with proper redundancy.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔌</div>
          <h3>SMTP Connectivity</h3>
          <p>
            Tests SMTP server connectivity, STARTTLS support, and TLS certificate
            validation for secure email delivery.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🚫</div>
          <h3>Blacklist Check</h3>
          <p>
            Checks if your mail server IPs are listed on major email blacklists
            that could block your emails.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔒</div>
          <h3>MTA-STS Check</h3>
          <p>
            Validates MTA-STS configuration to enforce TLS encryption for
            incoming email connections.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h3>TLS-RPT Check</h3>
          <p>
            Verifies TLS reporting is configured to receive reports about
            TLS connection failures.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🖼️</div>
          <h3>BIMI Record</h3>
          <p>
            Checks Brand Indicators for Message Identification to display
            your logo in email clients.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🏅</div>
          <h3>BIMI VMC</h3>
          <p>
            Validates your Verified Mark Certificate for stronger brand
            verification in supported clients.
          </p>
        </div>
      </section>

      <section style={{ marginTop: '3rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
          How Scoring Works
        </h2>
        <p style={{ color: 'var(--gray-600)', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
          Your overall score is calculated using weighted checks:
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {[
            { label: 'DMARC', weight: '25%' },
            { label: 'SPF', weight: '20%' },
            { label: 'DKIM', weight: '20%' },
            { label: 'MX', weight: '20%' },
            { label: 'SMTP', weight: '15%' },
          ].map((item) => (
            <div key={item.label} style={{
              background: 'white',
              padding: '1rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--gray-200)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{item.label}</div>
              <div style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>{item.weight}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
