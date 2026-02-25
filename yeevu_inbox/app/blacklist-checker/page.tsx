import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'Email Blacklist Checker — Free IP & Domain Blacklist Lookup | Yeevu',
  description: 'Check if your domain or sending IP is listed on email blacklists (RBLs). Find out which blacklists are blocking your email and get actionable removal steps.',
};

export default function BlacklistCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🚫"
      title="Email Blacklist Checker"
      description="Email blacklists (RBLs — Realtime Blackhole Lists) are databases of IPs and domains known to send spam. If your sending infrastructure appears on one, receiving mail servers may silently drop or reject your messages. Enter a domain to check its blacklist status across all major registries."
      check="blacklist"
      whatChecks={[
        'Whether your domain appears on major DNS-based blacklists (DNSBLs)',
        'Listings on Spamhaus, Barracuda, SORBS, SpamCop, and other key RBLs',
        'The sending IP addresses associated with your mail servers',
        'How many blacklists you\'re listed on and which ones',
        'Guidance on how to request delisting from each registry',
      ]}
    />
  );
}
