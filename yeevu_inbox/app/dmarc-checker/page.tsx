import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'DMARC Record Checker — Free DMARC Lookup Tool | Yeevu',
  description: 'Check your DMARC record instantly. Verify your policy, alignment settings, and reporting configuration to protect your domain from spoofing and phishing.',
};

export default function DmarcCheckerPage() {
  return (
    <CheckerPageLayout
      icon="📋"
      title="DMARC Record Checker"
      description="DMARC (Domain-based Message Authentication, Reporting & Conformance) tells receiving mail servers what to do with emails that fail SPF or DKIM checks — reject them, quarantine them, or deliver them anyway. Without a DMARC policy, your domain is vulnerable to spoofing and phishing attacks. Enter a domain to inspect its DMARC configuration."
      check="dmarc"
      whatChecks={[
        'Whether a DMARC record exists at _dmarc.[domain]',
        'Your policy setting: none, quarantine, or reject',
        'Alignment mode for SPF and DKIM (relaxed or strict)',
        'Reporting addresses for aggregate (rua) and forensic (ruf) reports',
        'Subdomain policy and percentage (pct) settings',
      ]}
    />
  );
}
