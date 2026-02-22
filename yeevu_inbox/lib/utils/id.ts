export function generateScanId(prefix = 'scan'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}
