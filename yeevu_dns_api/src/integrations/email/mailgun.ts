import type { Integration } from '../../types/index.js'

export const mailgun: Integration = {
  id: 'setup/email/mailgun',
  name: 'Setup Mailgun',
  description: 'Configure MX and SPF records for Mailgun',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'MX', name: '@' },
    { action: 'create', type: 'MX', name: '@', content: 'mxa.mailgun.org', priority: 10 },
    { action: 'create', type: 'MX', name: '@', content: 'mxb.mailgun.org', priority: 10 },
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:mailgun.org ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}' },
  ],
}
