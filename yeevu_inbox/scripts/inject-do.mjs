/**
 * Post-build script: inject Durable Object exports into the generated worker.js.
 *
 * opennextjs-cloudflare generates .open-next/worker.js but has no built-in way
 * to include user-defined Durable Object classes. Wrangler requires every DO
 * listed in wrangler.toml to be exported from the worker entrypoint.
 *
 * This script appends the necessary export(s) after each build. Run it between
 * `opennextjs-cloudflare build` and `opennextjs-cloudflare deploy/preview`.
 */

import { appendFileSync, existsSync } from 'fs';

const WORKER_PATH = '.open-next/worker.js';

if (!existsSync(WORKER_PATH)) {
  console.error(`✗ ${WORKER_PATH} not found — did you run the build first?`);
  process.exit(1);
}

// Path is relative to .open-next/worker.js; lib/ sits one directory up.
// do.ts imports from 'cloudflare:workers' (runtime-only) — wrangler/esbuild handles it.
const injection = `\n// User-defined Durable Objects\nexport { RateLimiter } from "../lib/rate-limiter/do.ts";\n`;

appendFileSync(WORKER_PATH, injection);
console.log(`✓ Injected RateLimiter DO export into ${WORKER_PATH}`);
