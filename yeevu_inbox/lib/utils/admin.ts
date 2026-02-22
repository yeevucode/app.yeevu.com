export function isAdmin(userId: string | undefined, adminIds: string): boolean {
  if (!userId || !adminIds) return false;
  return adminIds.split(',').map((s) => s.trim()).includes(userId);
}
