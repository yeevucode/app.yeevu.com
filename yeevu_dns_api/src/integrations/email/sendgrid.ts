import type { Integration } from '../../types/index.js'

export const sendgrid: Integration = {
  id: 'setup/email/sendgrid',
  name: 'Setup SendGrid',
  description: 'Configure SPF record for SendGrid sending',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:sendgrid.net ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}' },
  ],
}
