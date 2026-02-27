import type { Integration } from '../../types/index.js'

export const dmarc: Integration = {
  id: 'setup/dmarc',
  name: 'Setup DMARC Record',
  description: 'Create or replace a DMARC record to define email authentication policy and reporting',
  params: [
    { name: 'domain', required: true, description: 'Your domain name' },
    { name: 'policy', required: false, default: 'none', description: 'DMARC policy: none (monitor), quarantine, or reject. Defaults to none' },
    { name: 'rua', required: false, default: '', description: 'Email address to receive aggregate reports, e.g. mailto:dmarc@example.com' },
    { name: 'ruf', required: false, default: '', description: 'Email address to receive forensic reports, e.g. mailto:forensic@example.com' },
  ],
  steps: [
    { action: 'delete_existing', type: 'TXT', name: '_dmarc' },
    { action: 'create', type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p={{policy}}; rua={{rua}}; ruf={{ruf}}' },
  ],
}
