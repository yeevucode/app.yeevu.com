import type { Integration } from '../../types/index.js'

export const mxroute: Integration = {
  id: 'setup/email/mxroute',
  name: 'Setup MXRoute',
  description: 'Configure MX and SPF records for MXRoute',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'mx_host', required: true, description: 'Your MXRoute mail server hostname (e.g. route1.mx.cloudilax.com)' },
    { name: 'dmarc_rua', required: false, default: '', description: 'DMARC aggregate report email' },
  ],
  steps: [
    { action: 'delete_existing', type: 'MX', name: '@' },
    { action: 'create', type: 'MX', name: '@', content: '{{mx_host}}', priority: 10 },
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:mxroute.com ~all' },
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none; rua={{dmarc_rua}}' },
  ],
}
