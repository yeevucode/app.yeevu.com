import type { Integration } from '../types/index.js'

// Website
import { wix } from './website/wix.js'
import { squarespace } from './website/squarespace.js'
import { shopify } from './website/shopify.js'

// Email
import { googleWorkspace } from './email/google-workspace.js'
import { microsoft365 } from './email/microsoft-365.js'
import { mailgun } from './email/mailgun.js'
import { mailchimp } from './email/mailchimp.js'
import { zoho } from './email/zoho.js'
import { mxroute } from './email/mxroute.js'
import { sendgrid } from './email/sendgrid.js'

// DNS — standalone record utilities
import { spf } from './dns/spf.js'
import { dmarc } from './dns/dmarc.js'
import { dkim } from './dns/dkim.js'

// Registry — add new integrations here
const registry: Integration[] = [
  // Website
  wix,
  squarespace,
  shopify,
  // Email
  googleWorkspace,
  microsoft365,
  mailgun,
  mailchimp,
  zoho,
  mxroute,
  sendgrid,
  // DNS utilities
  spf,
  dmarc,
  dkim,
]

export function listIntegrations(): Integration[] {
  return registry
}

export function getIntegration(id: string): Integration | null {
  return registry.find(i => i.id === id) ?? null
}
