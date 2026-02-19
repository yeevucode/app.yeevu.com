/**
 * Core type definitions for YeevuInbox scanner
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  status: CheckStatus;
  score: number; // 0-100 for this check
  details: Record<string, unknown>;
  raw?: Record<string, unknown>;
  recommendations?: string[];
  error?: string;
}

export interface ScanCategories {
  mx: CheckResult;
  spf: CheckResult;
  dkim: CheckResult;
  dmarc: CheckResult;
  smtp: CheckResult;
  blacklist?: CheckResult;
  compliance?: CheckResult;
  bimi?: CheckResult;
  mta_sts?: CheckResult;
  tls_rpt?: CheckResult;
  bimi_record?: CheckResult;
  bimi_vmc?: CheckResult;
}

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  check: string;
  title: string;
  description: string;
  remediation?: string;
}

export interface ScanReport {
  scan_id: string;
  domain: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  score: number; // 0-100 overall
  categories: ScanCategories;
  issues: Issue[];
  recommendations: string[];
  raw_outputs?: Record<string, unknown>;
}

export interface ScanOptions {
  dkim_selectors?: string[];
  smtp_timeout?: number;
  dns_timeout?: number;
  skip_checks?: string[];
}

export type CheckRunner = (domain: string, options?: ScanOptions) => Promise<CheckResult>;
