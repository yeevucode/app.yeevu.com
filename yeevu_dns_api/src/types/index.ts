// --- DNS Record Types ---

export type RecordType = 'A' | 'MX' | 'TXT' | 'CNAME'

export interface DnsRecord {
  id: string
  type: RecordType
  name: string
  content: string
  ttl: number
  priority?: number // MX only
  proxied?: boolean
  comment?: string
}

export interface CreateRecordPayload {
  name: string
  content: string
  ttl?: number
  priority?: number
  proxied?: boolean
  comment?: string
}

export interface UpdateRecordPayload extends Partial<CreateRecordPayload> {}

// --- Domain ---

export interface Domain {
  id: string       // internal Yeevu ID
  name: string     // e.g. example.com
  zoneId: string   // Cloudflare Zone ID — never exposed via API
  accountId: string
}

// --- Integration ---

export type StepAction = 'create' | 'delete_existing' | 'delete'

export interface IntegrationStep {
  action: StepAction
  type: RecordType
  name?: string        // record name, defaults to '@'
  content?: string     // supports {{param}} interpolation
  priority?: number
  ttl?: number
  match?: string       // for delete_existing: only delete if content contains this string
}

export interface IntegrationParam {
  name: string
  required: boolean
  default?: string
  description?: string
}

export interface Integration {
  id: string           // e.g. 'setup/email/google-workspace'
  name: string
  description: string
  params: IntegrationParam[]
  steps: IntegrationStep[]
}

export interface RunIntegrationPayload {
  domain: string
  params?: Record<string, string>
}

export interface IntegrationResult {
  integrationId: string
  domain: string
  steps: StepResult[]
  success: boolean
}

export interface StepResult {
  action: StepAction
  type: RecordType
  name: string
  status: 'success' | 'error' | 'skipped'
  recordId?: string
  error?: string
}

// --- Snapshots ---

export type SnapshotTrigger = 'onboarding' | 'pre-integration' | 'manual'

export interface SnapshotMeta {
  id: string
  domain: string
  version: number          // 0 = original import, increments per snapshot
  label: string            // e.g. "Original", "Before setup/email/google-workspace"
  trigger: SnapshotTrigger
  integrationId?: string   // set when trigger = pre-integration
  createdAt: string        // ISO timestamp
  recordCount: number
}

export interface DnsSnapshot extends SnapshotMeta {
  records: DnsRecord[]
}

export interface RestoreResult {
  snapshotId: string
  domain: string
  deleted: number
  created: number
  success: boolean
}

// --- NLP Router ---

export interface NlpRequest {
  input: string
  domain?: string  // optional override, otherwise resolved from session
}

export interface NlpRouterResult {
  integrationId: string
  params: Record<string, string>
  confidence: 'high' | 'low'
  clarification?: string  // set when confidence is low
}

// --- API Responses ---

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
