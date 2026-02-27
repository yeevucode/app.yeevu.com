import { proxyDns } from '@/lib/proxy'
export const dynamic = 'force-dynamic'
export async function GET() { return proxyDns('/integrations') }
