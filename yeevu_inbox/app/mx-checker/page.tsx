import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'MX Record Lookup — Check Mail Exchange Records | Yeevu',
  description: 'Look up MX records for any domain. Verify your mail exchange servers are correctly configured and resolving properly for reliable email delivery.',
};

export default function MxCheckerPage() {
  return (
    <CheckerPageLayout
      icon="📬"
      title="MX Record Lookup"
      description="MX (Mail Exchange) records tell other mail servers where to deliver email for your domain. Missing, misconfigured, or unresolvable MX records mean incoming email will bounce. Enter a domain to inspect its MX configuration."
      check="mx"
      whatChecks={[
        'Whether MX records exist and are correctly published',
        'Priority values across multiple mail server entries',
        'Whether each MX hostname resolves to a valid IP address',
        'Missing or duplicate MX entries that could affect delivery',
        'Common mail provider identification (Google, Microsoft, etc.)',
      ]}
    />
  );
}
