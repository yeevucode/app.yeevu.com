import type { DnsRecord, CreateRecordPayload, UpdateRecordPayload, RecordType } from '../types/index.js'

const CF_API = 'https://api.cloudflare.com/client/v4'

export class CloudflareClient {
  constructor(private token: string) {}

  private headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${CF_API}${path}`, {
      ...options,
      headers: { ...this.headers(), ...(options?.headers ?? {}) },
    })

    const json = await res.json() as { success: boolean; result: T; errors: { message: string }[] }

    if (!json.success) {
      throw new Error(json.errors?.[0]?.message ?? 'Cloudflare API error')
    }

    return json.result
  }

  async getZoneIdByDomain(domain: string): Promise<string | null> {
    const result = await this.fetch<{ id: string }[]>(`/zones?name=${domain}`)
    return result?.[0]?.id ?? null
  }

  async listRecords(zoneId: string, type?: RecordType): Promise<DnsRecord[]> {
    const query = type ? `?type=${type}` : ''
    return this.fetch<DnsRecord[]>(`/zones/${zoneId}/dns_records${query}`)
  }

  async createRecord(zoneId: string, type: RecordType, payload: CreateRecordPayload): Promise<DnsRecord> {
    return this.fetch<DnsRecord>(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({ type, ttl: 300, proxied: false, ...payload }),
    })
  }

  async updateRecord(zoneId: string, recordId: string, payload: UpdateRecordPayload): Promise<DnsRecord> {
    return this.fetch<DnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteRecord(zoneId: string, recordId: string): Promise<void> {
    await this.fetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
  }

  async scanRecords(zoneId: string): Promise<void> {
    await this.fetch(`/zones/${zoneId}/dns_records/scan`, { method: 'POST' })
  }
}
