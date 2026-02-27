import type { Integration } from '../../types/index.js'

export const shopify: Integration = {
  id: 'setup/website/shopify',
  name: 'Point to Shopify',
  description: 'Configure A and CNAME records to point your domain to Shopify',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
  ],
  steps: [
    { action: 'delete_existing', type: 'A', name: '@' },
    { action: 'create', type: 'A', name: '@', content: '23.227.38.65' },
    { action: 'delete_existing', type: 'CNAME', name: 'www' },
    { action: 'create', type: 'CNAME', name: 'www', content: 'shops.myshopify.com' },
  ],
}
