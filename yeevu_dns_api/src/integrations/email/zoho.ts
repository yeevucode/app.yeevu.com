import type { Integration } from '../../types/index.js'

export const zoho: Integration = {
  id: 'setup/email/zoho',
  name: 'Setup Zoho Mail',
  description: 'Configure MX, SPF, and DMARC records for Zoho Mail',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'MX', name: '@' },
    { action: 'create', type: 'MX', name: '@', content: 'mx.zoho.com', priority: 10 },
    { action: 'create', type: 'MX', name: '@', content: 'mx2.zoho.com', priority: 20 },
    { action: 'create', type: 'MX', name: '@', content: 'mx3.zoho.com', priority: 50 },
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:zoho.com ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}' },
  ],
}
