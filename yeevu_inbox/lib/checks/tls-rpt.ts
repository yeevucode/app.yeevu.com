/**
 * TLS-RPT Check (SMTP TLS Reporting)
 *
 * Purpose: Verify TLS-RPT is configured to receive reports about TLS failures
 * - Checks for _smtp._tls.domain.com TXT record
 * - Validates v=TLSRPTv1 format and rua address
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

interface TlsRptRecord {
  version: string;
  rua: string[];
  raw: string;
}

/**
 * Parse TLS-RPT record content
 * Format: v=TLSRPTv1; rua=mailto:reports@example.com
 */
function parseRecord(record: string): TlsRptRecord | null {
  const result: Partial<TlsRptRecord> = {
    rua: [],
    raw: record,
  };

  // Split by semicolon and parse key-value pairs
  const parts = record.split(';').map(p => p.trim());

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('=').trim();

    switch (key.trim().toLowerCase()) {
      case 'v':
        result.version = value;
        break;
      case 'rua': {
        // rua can have multiple addresses separated by comma
        const addresses = value.split(',').map(a => a.trim());
        result.rua = addresses;
        break;
      }
    }
  }

  if (result.version === 'TLSRPTv1' && result.rua && result.rua.length > 0) {
    return result as TlsRptRecord;
  }

  return null;
}

/**
 * Validate reporting URI format
 */
function validateRua(rua: string): { valid: boolean; type: 'mailto' | 'https' | 'unknown'; address: string } {
  if (rua.startsWith('mailto:')) {
    const email = rua.substring(7);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      valid: emailRegex.test(email),
      type: 'mailto',
      address: email,
    };
  }

  if (rua.startsWith('https://')) {
    return {
      valid: true,
      type: 'https',
      address: rua,
    };
  }

  return {
    valid: false,
    type: 'unknown',
    address: rua,
  };
}

export async function checkTlsRpt(domain: string): Promise<CheckResult> {
  try {
    // Check for _smtp._tls TXT record
    const tlsRptDomain = `_smtp._tls.${domain}`;
    let txtRecord: string | null = null;

    try {
      const txtRecords = await dns.resolveTxt(tlsRptDomain);
      const joined = txtRecords.flat().join('');

      if (joined.includes('v=TLSRPTv1')) {
        txtRecord = joined;
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
        },
        recommendations: [
          'Add TLS-RPT TXT record at _smtp._tls.yourdomain.com',
          'Example: v=TLSRPTv1; rua=mailto:tlsrpt@yourdomain.com',
          'TLS-RPT helps you receive reports about TLS connection failures to your mail servers',
        ],
      };
    }

    // Parse the record
    const parsed = parseRecord(txtRecord);

    if (!parsed) {
      return {
        status: 'warn',
        score: 40,
        details: {
          has_record: true,
          txt_record: txtRecord,
          parse_error: 'Could not parse TLS-RPT record',
        },
        recommendations: [
          'TLS-RPT record found but could not be parsed',
          'Ensure format is: v=TLSRPTv1; rua=mailto:address@domain.com',
          'The rua field is required for receiving reports',
        ],
      };
    }

    // Validate reporting URIs
    const validatedRuas = parsed.rua.map(rua => validateRua(rua));
    const validRuas = validatedRuas.filter(r => r.valid);
    const invalidRuas = validatedRuas.filter(r => !r.valid);

    let score = 100;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const recommendations: string[] = [];

    if (validRuas.length === 0) {
      score = 30;
      status = 'fail';
      recommendations.push('No valid reporting addresses found in TLS-RPT record');
      recommendations.push('Add a valid mailto: or https:// address in the rua field');
    } else if (invalidRuas.length > 0) {
      score -= invalidRuas.length * 10;
      status = 'warn';
      recommendations.push(
        `Found ${invalidRuas.length} invalid reporting address(es): ${invalidRuas.map(r => r.address).join(', ')}`
      );
    }

    // Check for mailto vs https
    const hasMailto = validRuas.some(r => r.type === 'mailto');
    const hasHttps = validRuas.some(r => r.type === 'https');

    if (!hasMailto) {
      recommendations.push(
        'Consider adding a mailto: address for compatibility with all reporters'
      );
    }

    return {
      status,
      score: Math.max(0, score),
      details: {
        has_record: true,
        txt_record: txtRecord,
        version: parsed.version,
        rua: validatedRuas.map(r => ({
          address: r.address,
          type: r.type,
          valid: r.valid,
        })),
        has_mailto: hasMailto,
        has_https: hasHttps,
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
        'TLS-RPT record should be at _smtp._tls.yourdomain.com',
      ],
    };
  }
}
