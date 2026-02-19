/**
 * Storage Factory
 *
 * Auto-selects the appropriate storage backend based on environment:
 * - Local development: FileStorage (file system)
 * - Production (Cloudflare): KVStorage (Cloudflare KV)
 */

import { IProjectStorage } from './interface';

// Re-export types for convenience
export * from './interface';

// Detect if running on Cloudflare Workers
function isCloudflareWorker(): boolean {
  // Check for Cloudflare-specific globals
  return typeof globalThis !== 'undefined' &&
    'caches' in globalThis &&
    typeof (globalThis as Record<string, unknown>).caches === 'object' &&
    // Additional check: in Node.js, caches won't have the Cloudflare-specific API
    process.env.NODE_ENV === 'production';
}

// Singleton storage instance
let storageInstance: IProjectStorage | null = null;

/**
 * Get the storage instance
 * Uses lazy initialization to avoid import issues
 */
export async function getStorage(): Promise<IProjectStorage> {
  if (storageInstance) {
    return storageInstance;
  }

  // In production (Cloudflare), use KV storage
  if (isCloudflareWorker() || process.env.USE_KV_STORAGE === 'true') {
    const { KVStorage } = await import('./kv');
    storageInstance = new KVStorage();
  } else {
    // In development, use file storage
    const { FileStorage } = await import('./file');
    storageInstance = new FileStorage();
  }

  return storageInstance;
}

/**
 * Reset storage instance (useful for testing)
 */
export function resetStorage(): void {
  storageInstance = null;
}
