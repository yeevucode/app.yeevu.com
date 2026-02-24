import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckerWidget from '../_components/checker-widget';

export const metadata: Metadata = {
  title: 'MX Record Lookup — Check Mail Exchange Records | Yeevu',
  description: 'Look up MX records for any domain. Verify your mail exchange servers are correctly configured and resolving properly for reliable email delivery.',
};

export default function MxCheckerPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        MX Record Lookup
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 600 }}>
        MX (Mail Exchange) records tell other mail servers where to deliver email for your domain.
        Missing, misconfigured, or unresolvable MX records mean incoming email will bounce.
        Enter a domain to inspect its MX configuration.
      </p>

      <Suspense>
        <CheckerWidget check="mx" />
      </Suspense>

      <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>What does this check?</h2>
        <ul style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Whether MX records exist and are correctly published</li>
          <li>Priority values across multiple mail server entries</li>
          <li>Whether each MX hostname resolves to a valid IP address</li>
          <li>Missing or duplicate MX entries that could affect delivery</li>
          <li>Common mail provider identification (Google, Microsoft, etc.)</li>
        </ul>
      </div>
    </div>
  );
}
