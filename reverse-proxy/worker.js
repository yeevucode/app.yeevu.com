/**
 * app-yeevu-router
 *
 * Central reverse proxy for app.yeevu.com.
 * Add new app routes here — deploy with `npm run deploy`.
 *
 * Routing rules:
 *   /deliverability/*  → deliverability-yeevu (YeevuInbox)
 *   /email_warmup/*    → pulse-yeevu (YeevuPulse)
 *   /dns/*             → yeevu-dns-ui (YeevuDNS)
 *   everything else    → cpde2.hostypanel.com (static site origin)
 */

const WORKER_ROUTES = [
  { prefix: '/deliverability', upstream: 'https://deliverability-yeevu.domains-12a.workers.dev' },
  { prefix: '/email_warmup',   upstream: 'https://pulse-yeevu.domains-12a.workers.dev' },
  { prefix: '/dns',            upstream: 'https://yeevu-dns-ui.domains-12a.workers.dev' },
];

const ORIGIN = 'cpde2.hostypanel.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    for (const route of WORKER_ROUTES) {
      if (url.pathname.startsWith(route.prefix)) {
        const headers = new Headers(request.headers);
        const clientIP = request.headers.get('CF-Connecting-IP');
        if (clientIP) headers.set('X-Forwarded-For', clientIP);

        return fetch(`${route.upstream}${url.pathname}${url.search}`, {
          method: request.method,
          headers,
          body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
          redirect: 'manual',
        });
      }
    }

    // Fall through to static site origin
    return fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      cf: { resolveOverride: ORIGIN },
    });
  },
};
