import type { Integration } from '../../types/index.js'

export const googleWorkspace: Integration = {
  id: 'setup/email/google-workspace',
  name: 'Setup Google Workspace Email',
  description: 'Configure MX, SPF, and DMARC records for Google Workspace',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email (e.g. rua@dmarcian.com)' },
    { name: 'dmarc_ruf', required: false, default: '', description: 'DMARC forensic report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'MX', name: '@' },
    { action: 'create', type: 'MX', name: '@', content: 'aspmx.l.google.com', priority: 1 },
    { action: 'create', type: 'MX', name: '@', content: 'alt1.aspmx.l.google.com', priority: 5 },
    { action: 'create', type: 'MX', name: '@', content: 'alt2.aspmx.l.google.com', priority: 5 },
    { action: 'create', type: 'MX', name: '@', content: 'alt3.aspmx.l.google.com', priority: 10 },
    { action: 'create', type: 'MX', name: '@', content: 'alt4.aspmx.l.google.com', priority: 10 },
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:_spf.google.com ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}; ruf={{dmarc_ruf}}' },
  ],
}
