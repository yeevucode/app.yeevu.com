import type { AuthUser } from '../middleware/auth.js'

export type HonoEnv = {
  Bindings: {
    DB: D1Database
    CLOUDFLARE_API_TOKEN: string
    ANTHROPIC_API_KEY: string
    BOOTSTRAP_SECRET: string
  }
  Variables: {
    user: AuthUser
  }
}
