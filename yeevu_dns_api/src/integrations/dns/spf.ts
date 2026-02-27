import type { Integration } from '../../types/index.js'

export const spf: Integration = {
  id: 'setup/spf',
  name: 'Setup SPF Record',
  description: 'Create or replace a custom SPF record to authorise email sending sources',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'include', required: true, description: 'The include directive, e.g. _spf.google.com or mail.example.com' },
    { name: 'policy', required: false, default: '~all', description: 'SPF policy: ~all (softfail), -all (fail), ?all (neutral). Defaults to ~all' },
  ],
  steps: [
    { action: 'delete_existing', type: 'TXT', name: '@', match: 'v=spf1' },
    { action: 'create', type: 'TXT', name: '@', content: 'v=spf1 include:{{include}} {{policy}}' },
  ],
}
