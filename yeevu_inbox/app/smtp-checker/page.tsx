import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'SMTP Checker — Test Mail Server Connectivity & TLS | Yeevu',
  description: 'Test your SMTP mail server connectivity, STARTTLS support, and TLS certificate validity. Diagnose connection issues before they affect email delivery.',
};

export default function SmtpCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🔌"
      title="SMTP Server Checker"
      description="SMTP (Simple Mail Transfer Protocol) is the foundation of email delivery. Connection failures, missing STARTTLS support, or expired TLS certificates on your mail server can silently prevent email from being sent or received. Enter a domain to test its SMTP configuration."
      check="smtp"
      whatChecks={[
        'TCP connectivity to your mail server on port 25',
        'STARTTLS support for opportunistic TLS encryption',
        'TLS certificate validity and expiry date',
        'SMTP banner and server greeting response',
        'Whether the server accepts connections without timing out',
      ]}
    />
  );
}
