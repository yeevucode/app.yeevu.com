import type { Integration } from '../../types/index.js'

export const mailchimp: Integration = {
  id: 'setup/email/mailchimp',
  name: 'Setup Mailchimp',
  description: 'Configure DKIM and SPF records to authenticate Mailchimp email sending',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
  ],
  steps: [
    // DKIM authentication via CNAME (Mailchimp standard k1 selector)
    { action: 'delete_existing', type: 'CNAME', name: 'k1._domainkey' },
    { action: 'create', type: 'CNAME', name: 'k1._domainkey', content: 'dkim.mcsv.net' },
    // SPF — authorise Mailchimp servers to send on behalf of the domain
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:servers.mcsv.net ~all' },
  ],
}
