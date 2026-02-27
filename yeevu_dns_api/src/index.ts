import { Hono } from 'hono'
import domains from './routes/domains.js'
import records from './routes/records.js'
import integrations from './routes/integrations.js'
import snapshots from './routes/snapshots.js'
import onboarding from './routes/onboarding.js'
import nlp from './routes/nlp.js'
import bootstrap from './routes/bootstrap.js'
import type { HonoEnv } from './types/env.js'

const app = new Hono<HonoEnv>()

// Health check
app.get('/', (c) => c.json({ service: 'YeevuDNS', status: 'ok' }))

// Routes
app.route('/accounts/bootstrap', bootstrap)
app.route('/onboarding', onboarding)
app.route('/domains', domains)
app.route('/records', records)
app.route('/integrations', integrations)
app.route('/snapshots', snapshots)
app.route('/nlp', nlp)

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404))

// Error handler
app.onError((err, c) => {
  console.error(err)
  return c.json({ success: false, error: 'Internal server error' }, 500)
})

// Cloudflare Workers entry point
export default app
