import type { Integration } from '../../types/index.js'

export const wix: Integration = {
  id: 'setup/website/wix',
  name: 'Point to Wix',
  description: 'Configure A records to point your domain to Wix',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
  ],
  steps: [
    { action: 'delete_existing', type: 'A', name: '@' },
    { action: 'create', type: 'A', name: '@', content: '23.236.62.147' },
    { action: 'create', type: 'A', name: '@', content: '35.186.238.101' },
    { action: 'delete_existing', type: 'CNAME', name: 'www' },
    { action: 'create', type: 'CNAME', name: 'www', content: 'www.wixdns.net' },
  ],
}
