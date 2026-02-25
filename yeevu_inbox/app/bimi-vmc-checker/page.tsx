import type { Metadata } from 'next';
import CheckerPageLayout from '../_components/checker-page-layout';

export const metadata: Metadata = {
  title: 'BIMI VMC Checker — Verify Verified Mark Certificate | Yeevu',
  description: "Check your BIMI Verified Mark Certificate (VMC) to enable Gmail's blue verified checkmark next to your brand logo. Validate certificate chain and logo compliance.",
};

export default function BimiVmcCheckerPage() {
  return (
    <CheckerPageLayout
      icon="🏅"
      title="BIMI VMC Checker"
      description="A Verified Mark Certificate (VMC) is a digital certificate issued by a Certificate Authority that validates your brand logo for BIMI. It enables Gmail to display a blue verified checkmark alongside your logo, giving recipients a strong visual trust signal. Enter a domain to validate your VMC configuration."
      check="bimi_vmc"
      whatChecks={[
        'Whether a VMC is referenced in the BIMI a= tag',
        'Reachability and validity of the VMC certificate file',
        'Certificate chain verification and issuer (DigiCert, Entrust)',
        'Certificate expiry and domain ownership match',
        'Whether the embedded logo meets BIMI SVG Tiny PS requirements',
      ]}
    />
  );
}
