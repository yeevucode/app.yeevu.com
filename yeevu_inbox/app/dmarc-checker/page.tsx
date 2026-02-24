import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckerWidget from '../_components/checker-widget';

export const metadata: Metadata = {
  title: 'DMARC Record Checker — Free DMARC Lookup Tool | Yeevu',
  description: 'Check your DMARC record instantly. Verify your DMARC policy, alignment mode, and reporting configuration to protect your domain from email spoofing.',
};

export default function DmarcCheckerPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        DMARC Record Checker
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 600 }}>
        DMARC (Domain-based Message Authentication, Reporting and Conformance) protects your
        domain from email spoofing and phishing. Enter your domain to verify your DMARC record
        is correctly published and configured.
      </p>

      <Suspense>
        <CheckerWidget check="dmarc" />
      </Suspense>

      <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>What does this check?</h2>
        <ul style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Whether a <code>_dmarc</code> TXT record exists for your domain</li>
          <li>Your DMARC policy (<code>none</code>, <code>quarantine</code>, or <code>reject</code>)</li>
          <li>SPF and DKIM alignment modes (<code>relaxed</code> or <code>strict</code>)</li>
          <li>Reporting addresses for aggregate and forensic reports</li>
          <li>Policy percentage (<code>pct</code>) coverage</li>
        </ul>
      </div>
    </div>
  );
}
