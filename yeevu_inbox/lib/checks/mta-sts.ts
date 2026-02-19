/**
 * MTA-STS Check (Mail Transfer Agent Strict Transport Security)
 *
 * Purpose: Verify MTA-STS is configured to enforce TLS for inbound email
 * - Checks for _mta-sts.domain.com TXT record
 * - Fetches and validates policy file at https://mta-sts.domain.com/.well-known/mta-sts.txt
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

interface MtaStsPolicy {
  version: string;
  mode: 'enforce' | 'testing' | 'none' | string;
  mx: string[];
  max_age: number;
  raw: string;
}

/**
 * Parse MTA-STS policy file content
 */
function parsePolicy(content: string): MtaStsPolicy | null {
  const lines = content.trim().split('\n');
  const policy: Partial<MtaStsPolicy> = {
    mx: [],
    raw: content,
  };

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    switch (key.trim().toLowerCase()) {
      case 'version':
        policy.version = value;
        break;
      case 'mode':
        policy.mode = value.toLowerCase() as MtaStsPolicy['mode'];
        break;
      case 'mx':
        policy.mx!.push(value);
        break;
      case 'max_age':
        policy.max_age = parseInt(value, 10);
        break;
    }
  }

  if (policy.version && policy.mode && policy.max_age !== undefined) {
    return policy as MtaStsPolicy;
  }

  return null;
}

/**
 * Fetch MTA-STS policy file with timeout
 */
async function fetchPolicy(domain: string): Promise<{ policy: MtaStsPolicy | null; error?: string }> {
  const policyUrl = `https://mta-sts.${domain}/.well-known/mta-sts.txt`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(policyUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'YeevuInbox-MTA-STS-Checker/1.0' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { policy: null, error: `Policy file returned ${response.status}` };
    }

    const content = await response.text();
    const policy = parsePolicy(content);

    if (!policy) {
      return { policy: null, error: 'Could not parse policy file' };
    }

    return { policy };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      return { policy: null, error: 'Request timed out' };
    }
    return { policy: null, error: err.message };
  }
}

export async function checkMtaSts(domain: string): Promise<CheckResult> {
  try {
    // Step 1: Check for _mta-sts TXT record
    const mtaStsDomain = `_mta-sts.${domain}`;
    let txtRecord: string | null = null;
    let recordId: string | null = null;

    try {
      const txtRecords = await dns.resolveTxt(mtaStsDomain);
      const joined = txtRecords.flat().join('');

      if (joined.startsWith('v=STSv1')) {
        txtRecord = joined;
        // Extract id from record (e.g., v=STSv1; id=20231201T000000)
        const idMatch = joined.match(/id=([^;\s]+)/);
        if (idMatch) {
          recordId = idMatch[1];
        }
      }
    } catch {
      // No TXT record found
    }

    if (!txtRecord) {
      return {
        status: 'fail',
        score: 0,
        details: {
          has_record: false,
          txt_record: null,
          policy: null,
        },
        recommendations: [
          'Add MTA-STS TXT record: v=STSv1; id=<unique_id>',
          'Create policy file at https://mta-sts.yourdomain.com/.well-known/mta-sts.txt',
          'MTA-STS enforces TLS for incoming email, protecting against downgrade attacks',
        ],
      };
    }

    // Step 2: Fetch and validate policy file
    const { policy, error: policyError } = await fetchPolicy(domain);

    if (!policy) {
      return {
        status: 'warn',
        score: 40,
        details: {
          has_record: true,
          txt_record: txtRecord,
          record_id: recordId,
          policy: null,
          policy_error: policyError,
        },
        recommendations: [
          `MTA-STS record found but policy file error: ${policyError}`,
          'Ensure https://mta-sts.yourdomain.com/.well-known/mta-sts.txt is accessible',
          'Policy file must contain: version, mode, mx, and max_age fields',
        ],
      };
    }

    // Step 3: Evaluate policy
    let score = 70;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const recommendations: string[] = [];

    // Check mode
    if (policy.mode === 'enforce') {
      score = 100;
    } else if (policy.mode === 'testing') {
      score = 80;
      status = 'warn';
      recommendations.push(
        'MTA-STS is in testing mode. Once validated, switch to enforce mode for full protection.'
      );
    } else if (policy.mode === 'none') {
      score = 50;
      status = 'warn';
      recommendations.push(
        'MTA-STS mode is set to none. Set to testing or enforce for TLS protection.'
      );
    }

    // Check max_age (should be at least 1 week = 604800 seconds)
    if (policy.max_age < 604800) {
      score -= 10;
      recommendations.push(
        `max_age is ${policy.max_age} seconds (${Math.round(policy.max_age / 86400)} days). Consider at least 1 week (604800 seconds).`
      );
    }

    // Check MX patterns
    if (policy.mx.length === 0) {
      score -= 20;
      status = 'warn';
      recommendations.push('No MX patterns defined in policy. Add mx: entries for your mail servers.');
    }

    return {
      status,
      score: Math.max(0, score),
      details: {
        has_record: true,
        txt_record: txtRecord,
        record_id: recordId,
        policy: {
          version: policy.version,
          mode: policy.mode,
          mx_patterns: policy.mx,
          max_age: policy.max_age,
          max_age_days: Math.round(policy.max_age / 86400),
        },
      },
      recommendations,
    };

  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error),
      },
      recommendations: [
        'Check DNS configuration',
        'MTA-STS requires both a TXT record and a policy file',
      ],
    };
  }
}
