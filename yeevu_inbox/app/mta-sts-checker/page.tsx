import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'MTA-STS Checker — Test Mail Transfer Agent Strict Transport Security | Yeevu',
  description: 'Check your MTA-STS policy to verify TLS encryption is enforced for inbound email. Detect misconfigurations that leave your domain vulnerable to downgrade attacks.',
};

export default function MtaStsCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🔒"
      title="MTA-STS Checker"
      description="MTA-STS (Mail Transfer Agent Strict Transport Security) tells sending mail servers that your domain requires encrypted TLS connections. Without it, attackers can potentially downgrade connections and intercept email in transit. Enter a domain to verify your MTA-STS policy is correctly published and reachable."
      check="mta_sts"
      whatChecks={[
        'Whether an MTA-STS DNS TXT record exists at _mta-sts.[domain]',
        'Reachability of the policy file at https://mta-sts.[domain]/.well-known/mta-sts.txt',
        'Policy mode: none, testing, or enforce',
        'Listed MX hostnames and whether they match your actual MX records',
        'Policy max-age and whether it provides adequate protection',
      ]}
    />
  );
}
