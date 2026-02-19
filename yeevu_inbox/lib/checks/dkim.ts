/**
 * DKIM Check
 * 
 * Purpose: Validate DKIM public key discovery and key strength
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

const DEFAULT_SELECTORS = ['default', 'mail', 'selector1', 'selector2', 's1', 's2', 'k1', 'k2', 'google', 'dkim', 'x'];

export async function checkDkim(domain: string, selectors?: string[]): Promise<CheckResult> {
  try {
    const selectorsToTry = selectors && selectors.length > 0 ? selectors : DEFAULT_SELECTORS;
    const foundKeys: Array<{
      selector: string;
      found: boolean;
      keyBits?: number;
      version?: string;
      keyAlgo?: string;
    }> = [];
    
    // Probe each selector
    for (const selector of selectorsToTry) {
      const dkimDomain = `${selector}._domainkey.${domain}`;
      
      try {
        const txtRecords = await dns.resolveTxt(dkimDomain);
        const dkimRecord = txtRecords.flat().join('');
        
        if (dkimRecord.includes('v=DKIM1')) {
          // Parse DKIM record for key information
          const keyMatch = dkimRecord.match(/p=([^;]+)/);
          const keyString = keyMatch ? keyMatch[1].trim() : '';
          
          // Estimate key strength from base64 length (rough heuristic)
          // 1024-bit RSA ≈ 140 chars, 2048-bit ≈ 370 chars in base64
          let keyBits = 0;
          if (keyString.length < 250) {
            keyBits = 1024;
          } else if (keyString.length < 400) {
            keyBits = 2048;
          } else {
            keyBits = 4096;
          }
          
          foundKeys.push({
            selector,
            found: true,
            keyBits,
            version: 'DKIM1',
            keyAlgo: dkimRecord.includes('k=ed25519') ? 'Ed25519' : 'RSA'
          });
        }
      } catch {
        foundKeys.push({
          selector,
          found: false
        });
      }
    }
    
    // Check if we found any keys
    const validKeys = foundKeys.filter(k => k.found);
    
    if (validKeys.length === 0) {
      return {
        status: 'fail',
        score: 0,
        details: {
          selectors_probed: selectorsToTry,
          keys_found: 0,
          probed_results: foundKeys
        },
        recommendations: [
          'Generate DKIM key pair for your domain',
          'Common selectors: default, mail, selector1',
          'Publish DKIM public key as TXT record: selector._domainkey.domain.com',
          'Test with: dig +short selector._domainkey.example.com TXT'
        ]
      };
    }
    
    // Warn if using weak 1024-bit keys
    const weak1024Keys = validKeys.filter(k => k.keyBits === 1024);
    let score = validKeys.length >= 1 ? 90 : 70;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const recommendations: string[] = [];
    
    if (weak1024Keys.length > 0) {
      score -= 20;
      status = 'warn';
      recommendations.push(
        `WARNING: Found ${weak1024Keys.length} selector(s) with keys less than 2048-bit (weak encryption).`
      );
      recommendations.push(
        'Keys less than 2048-bit are considered insecure. Upgrade to 2048-bit RSA or Ed25519 keys.'
      );
    }
    
    if (validKeys.length < 2) {
      recommendations.push('Consider adding multiple DKIM selectors for key rotation');
    }
    
    return {
      status,
      score,
      details: {
        selectors_probed: selectorsToTry,
        keys_found: validKeys.length,
        found_keys: validKeys,
        all_results: foundKeys
      },
      recommendations
    };
    
  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error)
      },
      recommendations: [
        'Verify domain name is correct',
        'Check DNS nameserver configuration'
      ]
    };
  }
}
