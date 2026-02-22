export type UserTier = 'free' | 'premium' | 'unlimited';

export const TIER_LIMITS: Record<UserTier, number | null> = {
  free: 1,
  premium: 10,
  unlimited: null,
};

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
  if (tier === 'premium' || tier === 'unlimited') return tier;
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
