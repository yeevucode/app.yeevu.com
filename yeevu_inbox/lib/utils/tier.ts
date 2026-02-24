export type UserTier = 'free' | 'growth' | 'scale' | 'enterprise';

// Saved project limits per tier (null = unlimited)
export const TIER_LIMITS: Record<UserTier, number | null> = {
  free:       1,
  growth:     10,
  scale:      50,
  enterprise: null,
};

// Hourly scan rate limits per tier
export const TIER_RATE_LIMITS: Record<UserTier, { hourly: number; daily: number }> = {
  free:       { hourly: 5,  daily: 300  },
  growth:     { hourly: 10, daily: 600  },
  scale:      { hourly: 20, daily: 1200 },
  enterprise: { hourly: 30, daily: 9999 },
};

// Maximum age (seconds) of a cached scan result acceptable for each tier.
// Enterprise = 0 means always run a live scan (never serve cache).
export const TIER_CACHE_MAX_AGE_SECONDS: Record<UserTier, number> = {
  free:       1800, // 30 min
  growth:     900,  // 15 min
  scale:      300,  // 5 min
  enterprise: 0,    // real-time
};

// Anonymous users (not signed in) get a separate cache max age
export const ANON_CACHE_MAX_AGE_SECONDS = 300; // 5 min

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  all(): Promise<{ results: Record<string, string | number | null>[] }>;
  run(): Promise<void>;
}

export async function getUserTier(db: D1Database, userId: string): Promise<UserTier> {
  const result = await db
    .prepare('SELECT tier FROM users WHERE user_id = ?')
    .bind(userId)
    .all();
  const tier = result.results[0]?.tier as string | undefined;

  // Current tiers
  if (tier === 'growth' || tier === 'scale' || tier === 'enterprise') return tier;

  // Backward compatibility: map old tier names to new ones
  if (tier === 'unlimited') return 'enterprise';
  if (tier === 'premium')   return 'growth';

  return 'free';
}

export async function setUserTier(
  db: D1Database,
  userId: string,
  userEmail: string | null,
  tier: UserTier
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (user_id, user_email, tier, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         tier = excluded.tier,
         user_email = excluded.user_email,
         updated_at = excluded.updated_at`
    )
    .bind(userId, userEmail, tier, Date.now())
    .run();
}
