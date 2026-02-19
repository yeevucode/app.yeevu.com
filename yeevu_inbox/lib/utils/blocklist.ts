/**
 * Domain blocklist utility
 * Checks if a domain should be blocked from scanning
 */

/**
 * Convert a blocklist pattern to a regex
 * Supports:
 * - exact match: example.com
 * - wildcard prefix: *.example.com (any subdomain)
 * - wildcard suffix: example.* (any TLD)
 * - wildcard both: *.example.* (any subdomain and TLD)
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Check if a domain matches any blocked pattern
 */
export function isDomainBlocked(domain: string): boolean {
  const blockedDomainsEnv = process.env.BLOCKED_DOMAINS || '';

  if (!blockedDomainsEnv.trim()) {
    return false;
  }

  const patterns = blockedDomainsEnv
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const normalizedDomain = domain.toLowerCase().trim();

  for (const pattern of patterns) {
    const regex = patternToRegex(pattern.toLowerCase());
    if (regex.test(normalizedDomain)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the blocked domain error response
 */
export function getBlockedDomainError() {
  return {
    error: 'Unable to complete scan for this domain',
    blocked: true,
  };
}
