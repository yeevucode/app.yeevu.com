import type { Integration } from '../../types/index.js'

export const dkim: Integration = {
  id: 'setup/dkim',
  name: 'Setup DKIM Record',
  description: 'Add a DKIM public key TXT record for a given selector to enable email signing verification',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'selector', required: true, description: 'DKIM selector name, e.g. default, k1, s1, google' },
    { name: 'public_key', required: true, description: 'DKIM public key value (base64 encoded, without the p= prefix)' },
  ],
  steps: [
    { action: 'delete_existing', type: 'TXT', name: '{{selector}}._domainkey' },
    { action: 'create', type: 'TXT', name: '{{selector}}._domainkey', content: 'v=DKIM1; k=rsa; p={{public_key}}' },
  ],
}
