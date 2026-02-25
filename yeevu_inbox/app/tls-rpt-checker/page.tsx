import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'TLS-RPT Checker — Verify TLS Reporting Configuration | Yeevu',
  description: 'Check your TLS-RPT (SMTP TLS Reporting) record to ensure you receive reports about TLS connection failures. Catch delivery problems before they impact your domain.',
};

export default function TlsRptCheckerPage() {
  return (
    <CheckerPageLayout
      icon="📊"
      title="TLS-RPT Checker"
      description="TLS-RPT (TLS Reporting) lets you receive automated reports from other mail servers when they encounter TLS connection failures delivering email to your domain. Without it, TLS problems — such as certificate mismatches or negotiation failures — are invisible to you. Enter a domain to verify TLS reporting is active."
      check="tls_rpt"
      whatChecks={[
        'Presence of a TLS-RPT DNS TXT record at _smtp._tls.[domain]',
        'Valid rua= (reporting URI) tag pointing to an email address or HTTPS endpoint',
        'Correct record syntax and version field (v=TLSRPTv1)',
        'Whether TLS-RPT is paired with an active MTA-STS policy',
        'Common misconfigurations such as missing or malformed reporting URIs',
      ]}
    />
  );
}
