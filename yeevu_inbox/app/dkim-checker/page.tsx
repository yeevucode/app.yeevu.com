import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckerWidget from '../_components/checker-widget';

export const metadata: Metadata = {
  title: 'DKIM Checker — Verify DKIM Record & Signature | Yeevu',
  description: 'Check your DKIM record configuration. Verify that DKIM public keys are published and your email signatures are valid to improve inbox placement.',
};

export default function DkimCheckerPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        DKIM Record Checker
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 600 }}>
        DKIM (DomainKeys Identified Mail) adds a cryptographic signature to your outgoing emails,
        allowing receiving servers to verify the message hasn't been tampered with in transit.
        Enter your domain to discover and validate your DKIM public keys.
      </p>

      <Suspense>
        <CheckerWidget check="dkim" />
      </Suspense>

      <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>What does this check?</h2>
        <ul style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Auto-discovery of common DKIM selectors for your domain</li>
          <li>Whether DKIM public keys are correctly published in DNS</li>
          <li>Key length — 2048-bit RSA or Ed25519 is recommended</li>
          <li>Key flags and validity</li>
          <li>Weak or outdated 1024-bit keys that should be rotated</li>
        </ul>
      </div>
    </div>
  );
}
