import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckerWidget from '../_components/checker-widget';

export const metadata: Metadata = {
  title: 'Email Blacklist Checker — Free IP & Domain Blacklist Lookup | Yeevu',
  description: 'Check if your domain or sending IP is listed on email blacklists (RBLs). Find out which blacklists are blocking your email and get actionable removal steps.',
};

export default function BlacklistCheckerPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Email Blacklist Checker
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 600 }}>
        Email blacklists (RBLs — Realtime Blackhole Lists) are databases of IPs and domains
        known to send spam. If your sending infrastructure appears on one, receiving mail servers
        may silently drop or reject your messages. Enter a domain to check its blacklist status.
      </p>

      <Suspense>
        <CheckerWidget check="blacklist" />
      </Suspense>

      <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>What does this check?</h2>
        <ul style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Whether your domain appears on major DNS-based blacklists (DNSBLs)</li>
          <li>Listings on Spamhaus, Barracuda, SORBS, SpamCop, and other key RBLs</li>
          <li>The sending IP addresses associated with your mail servers</li>
          <li>How many blacklists you're listed on and which ones</li>
          <li>Guidance on how to request delisting from each registry</li>
        </ul>
      </div>
    </div>
  );
}
