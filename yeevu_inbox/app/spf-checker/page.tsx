import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'SPF Record Checker — Test Your SPF Record | Yeevu',
  description: 'Validate your SPF record instantly. Check if your Sender Policy Framework record is correctly configured to prevent email spoofing and improve deliverability.',
};

export default function SpfCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🛡️"
      title="SPF Record Checker"
      description="SPF (Sender Policy Framework) tells receiving mail servers which servers are authorised to send email on behalf of your domain. A missing or misconfigured SPF record can cause your emails to be rejected or marked as spam. Enter a domain to inspect its SPF record."
      check="spf"
      whatChecks={[
        'Whether an SPF TXT record exists at your root domain',
        'SPF record syntax and structure validity',
        'Number of DNS lookups (must not exceed 10)',
        'Whether your record ends with a valid all mechanism (~all, -all)',
        'Common misconfigurations like multiple SPF records',
      ]}
    />
  );
}
