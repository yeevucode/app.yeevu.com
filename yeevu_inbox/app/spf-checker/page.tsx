import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckerWidget from '../_components/checker-widget';

export const metadata: Metadata = {
  title: 'SPF Record Checker — Test Your SPF Record | Yeevu',
  description: 'Validate your SPF record instantly. Check if your Sender Policy Framework record is correctly configured to prevent email spoofing and improve deliverability.',
};

export default function SpfCheckerPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        SPF Record Checker
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 600 }}>
        SPF (Sender Policy Framework) tells receiving mail servers which servers are authorised
        to send email on behalf of your domain. A missing or misconfigured SPF record can cause
        your emails to be rejected or marked as spam.
      </p>

      <Suspense>
        <CheckerWidget check="spf" />
      </Suspense>

      <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>What does this check?</h2>
        <ul style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Whether an SPF TXT record exists at your root domain</li>
          <li>SPF record syntax and structure validity</li>
          <li>Number of DNS lookups (must not exceed 10)</li>
          <li>Whether your record ends with a valid all mechanism (<code>~all</code>, <code>-all</code>)</li>
          <li>Common misconfigurations like multiple SPF records</li>
        </ul>
      </div>
    </div>
  );
}
