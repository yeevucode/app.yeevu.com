/**
 * Shared scoring constants for YeevuInbox.
 *
 * Single source of truth for weights and multipliers used by both the
 * client-side results page and the server-side scan API.
 */

// Configuration score weights — must sum to 100.
// All 11 checks contribute. Blacklist is included as a weighted check AND
// triggers an additional fixed penalty (see BLACKLIST_PENALTIES below).
export const CHECK_WEIGHTS: Record<string, number> = {
  dmarc: 25,
  spf: 20,
  dkim: 20,
  blacklist: 15,
  mx: 5,
  smtp: 5,
  tls_rpt: 3,
  compliance: 3,
  mta_sts: 2,
  bimi_record: 1,
  bimi_vmc: 1,
};

// Fixed point penalties subtracted from the weighted score based on blacklist reputation tier.
// Applied on top of the blacklist check's weighted contribution so serious listings have
// real consequences beyond what a 15% weight alone would express.
// unknown = API error or unavailable — never penalise uncertainty.
export const BLACKLIST_PENALTIES: Record<string, number> = {
  clean: 0,
  minor_only: 5,
  major: 30,
  multi_major: 50,
  unknown: 0,
};

export type ReputationTier = keyof typeof BLACKLIST_PENALTIES;

// Canonical display order for all 11 checks.
// Used everywhere checks are rendered (dashboard badges, history table columns, rescan storage)
// so screenshots and comparisons are always consistent.
export const ORDERED_CHECKS = [
  'mx',
  'spf',
  'dkim',
  'dmarc',
  'smtp',
  'blacklist',
  'mta_sts',
  'tls_rpt',
  'bimi_record',
  'bimi_vmc',
  'compliance',
] as const;

export type CheckKey = typeof ORDERED_CHECKS[number];

// Human-readable labels for each check key.
export const CHECK_LABELS: Record<CheckKey, string> = {
  mx: 'MX',
  spf: 'SPF',
  dkim: 'DKIM',
  dmarc: 'DMARC',
  smtp: 'SMTP',
  blacklist: 'Blacklist',
  mta_sts: 'MTA-STS',
  tls_rpt: 'TLS-RPT',
  bimi_record: 'BIMI Record',
  bimi_vmc: 'BIMI VMC',
  compliance: 'Compliance',
};
