import type { AuthUser } from '../middleware/auth.js'
import type { DomainRow } from './db/index.js'

/**
 * Resolves a domain from the authenticated user's account.
 * Zone ID stays inside DomainRow — never returned to API callers.
 * Throws if the domain does not belong to the user.
 */
export function resolveDomain(user: AuthUser, domainName: string): DomainRow {
  const domain = user.domains.find(d => d.name === domainName)

  if (!domain) {
    throw new DomainNotFoundError(domainName)
  }

  return domain
}

export class DomainNotFoundError extends Error {
  constructor(domain: string) {
    super(`Domain "${domain}" not found on this account`)
    this.name = 'DomainNotFoundError'
  }
}
