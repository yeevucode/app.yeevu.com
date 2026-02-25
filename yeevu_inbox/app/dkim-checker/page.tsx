import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'DKIM Checker — Verify DKIM Record & Signature | Yeevu',
  description: 'Check your DKIM record configuration. Verify that DKIM public keys are published and your email signatures are valid to improve inbox placement.',
};

export default function DkimCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🔐"
      title="DKIM Record Checker"
      description="DKIM (DomainKeys Identified Mail) adds a cryptographic signature to your outgoing emails, allowing receiving servers to verify the message hasn't been tampered with in transit. A missing or invalid DKIM key causes emails to fail authentication checks and increases the likelihood of landing in spam. Enter a domain to discover and validate its DKIM keys."
      check="dkim"
      whatChecks={[
        'Auto-discovery of common DKIM selectors for your domain',
        'Whether DKIM public keys are correctly published in DNS',
        'Key length — 2048-bit RSA or Ed25519 is recommended',
        'Key flags, validity, and revocation status',
        'Weak or outdated 1024-bit keys that should be rotated',
      ]}
    />
  );
}
