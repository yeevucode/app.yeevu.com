import type { Integration } from '../../types/index.js'

export const microsoft365: Integration = {
  id: 'setup/email/microsoft-365',
  name: 'Setup Microsoft 365 Email',
  description: 'Configure MX, SPF, and DMARC records for Microsoft 365',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'mx_token', required: true, description: 'Your Microsoft 365 MX token (e.g. contoso-com)' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'MX', name: '@' },
    { action: 'create', type: 'MX', name: '@', content: '{{mx_token}}.mail.protection.outlook.com', priority: 0 },
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:spf.protection.outlook.com ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}' },
  ],
}
