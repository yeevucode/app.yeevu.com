// Shared helper for client components to construct API paths respecting basePath

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

export const apiPath = (path: string) => `${BASE}${path}`

export const appPath = (path: string) => `${BASE}${path}`
