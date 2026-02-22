const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

export function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain);
}
