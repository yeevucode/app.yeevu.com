import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'BIMI Checker — Verify Brand Logo in Email | Yeevu',
  description: 'Check your BIMI (Brand Indicators for Message Identification) record to display your logo in Gmail, Apple Mail, and other supported email clients.',
};

export default function BimiCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🖼️"
      title="BIMI Record Checker"
      description="BIMI (Brand Indicators for Message Identification) allows your company logo to appear next to your emails in supported inboxes like Gmail and Apple Mail, increasing recognition and trust. It requires a valid DMARC enforcement policy and a correctly formatted SVG logo. Enter a domain to verify your BIMI setup."
      check="bimi_record"
      whatChecks={[
        'Presence of a BIMI DNS TXT record at default._bimi.[domain]',
        'Valid l= tag pointing to an accessible SVG logo file',
        'Whether the logo URL is reachable and returns a valid SVG',
        'Optional a= tag for a Verified Mark Certificate (VMC)',
        'Whether your DMARC policy meets the enforcement requirement (quarantine or reject)',
      ]}
    />
  );
}
