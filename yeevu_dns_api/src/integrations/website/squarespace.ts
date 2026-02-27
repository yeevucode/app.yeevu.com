import type { Integration } from '../../types/index.js'

export const squarespace: Integration = {
  id: 'setup/website/squarespace',
  name: 'Point to Squarespace',
  description: 'Configure A and CNAME records to point your domain to Squarespace',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
  ],
  steps: [
    { action: 'delete_existing', type: 'A', name: '@' },
    { action: 'create', type: 'A', name: '@', content: '198.185.159.144' },
    { action: 'create', type: 'A', name: '@', content: '198.185.159.145' },
    { action: 'create', type: 'A', name: '@', content: '198.49.23.144' },
    { action: 'create', type: 'A', name: '@', content: '198.49.23.145' },
    { action: 'delete_existing', type: 'CNAME', name: 'www' },
    { action: 'create', type: 'CNAME', name: 'www', content: 'ext-cust.squarespace.com' },
  ],
}
