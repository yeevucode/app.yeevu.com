/**
 * Shared scoring constants for YeevuInbox.
 *
 * Single source of truth for weights and multipliers used by both the
 * client-side results page and the server-side scan API.
 */

// Configuration score weights — must sum to 100.
// DMARC: capstone of email auth, hardest to configure correctly.
// SPF/DKIM: equal foundational mechanisms.
// MX/SMTP: infrastructure verification only.
export const CHECK_WEIGHTS: Record<string, number> = {
  dmarc: 30,
  spf: 25,
  dkim: 25,
  mx: 10,
  smtp: 10,
};

// Reputation multipliers applied to the config score after all weighted checks complete.
// The blacklist result is NOT included in the weighted average — it is applied here as
// a post-calculation multiplier so the score visibly drops after the user sees the
// high config score (intentional UX — see wave ordering comment in results/page.tsx).
export const REPUTATION_MULTIPLIERS: Record<string, number> = {
  clean: 1.0,       // no listings
  minor_only: 0.85, // minor listings only — reduces score without tanking it
  major: 0.5,       // one or more major listings (Spamhaus, Barracuda, SpamCop, SORBS, NixSpam)
  multi_major: 0.25, // two or more major listings — severe reputation damage
  unknown: 1.0,     // check errored or unavailable — never penalise uncertainty
};

export type ReputationTier = keyof typeof REPUTATION_MULTIPLIERS;
