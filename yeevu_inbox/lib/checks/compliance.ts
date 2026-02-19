/**
 * Compliance Checks
 *
 * Purpose: Verify presence of privacy and terms pages (HTTP 200), detect consent checkbox/messages,
 * and detect subscription forms (email capture) on site pages.
 */

import { CheckResult } from '../types/scanner';

const PRIVACY_PATHS = ['/privacy', '/privacy-policy', '/privacy-policy/'];
const TERMS_PATHS = ['/terms', '/terms-and-condition', '/terms-and-conditions', '/terms/'];

function timeoutFetch(url: string, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function fetchText(url: string) {
  try {
    const res = await timeoutFetch(url);
    if (!res || !res.ok) return { status: res ? res.status : 0, text: '' };
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: '' };
  }
}

function looksLikeConsent(html: string) {
  const lc = html.toLowerCase();
  // Check for cookie consent phrases or accept/agree buttons
  if (lc.includes('cookie') && (lc.includes('consent') || lc.includes('accept') || lc.includes('agree'))) return true;
  if (lc.includes('i agree') || lc.includes('i accept') || lc.includes('opt-in') || lc.includes('opt in')) return true;
  return false;
}

function hasConsentCheckbox(html: string) {
  // basic heuristic: input type=checkbox near consent words
  const checkboxRegex = /<input[^>]+type=["']?checkbox["']?[^>]*>/i;
  if (!checkboxRegex.test(html)) return false;
  if (looksLikeConsent(html)) return true;
  return true; // checkbox present -> likely consent
}

function hasSubscriptionForm(html: string) {
  const lc = html.toLowerCase();
  // look for forms with email input
  if (/<form[^>]*>/.test(html) && /type=["']?email["']?/.test(html)) return true;
  if (lc.includes('subscribe') || lc.includes('newsletter') || lc.includes('sign up')) return true;
  return false;
}

export async function checkCompliance(domain: string): Promise<CheckResult> {
  try {
    const httpsBase = `https://${domain}`;
    const httpBase = `http://${domain}`;

    const privacyResults: Array<{ path: string; httpsStatus: number; httpStatus: number; consentCheckbox: boolean; consentMessage: boolean; subscriptionForm: boolean }> = [];
    const termsResults: Array<{ path: string; httpsStatus: number; httpStatus: number; subscriptionForm: boolean }> = [];

    // Check privacy paths
    for (const p of PRIVACY_PATHS) {
      const httpsUrl = `${httpsBase}${p}`;
      const httpUrl = `${httpBase}${p}`;
      const httpsRes = await fetchText(httpsUrl);
      const httpRes = await fetchText(httpUrl);

      const consentCheckbox = httpsRes.text ? hasConsentCheckbox(httpsRes.text) : (httpRes.text ? hasConsentCheckbox(httpRes.text) : false);
      const consentMessage = httpsRes.text ? looksLikeConsent(httpsRes.text) : (httpRes.text ? looksLikeConsent(httpRes.text) : false);
      const subscriptionForm = httpsRes.text ? hasSubscriptionForm(httpsRes.text) : (httpRes.text ? hasSubscriptionForm(httpRes.text) : false);

      privacyResults.push({ path: p, httpsStatus: httpsRes.status, httpStatus: httpRes.status, consentCheckbox, consentMessage, subscriptionForm });
    }

    // Check terms paths
    for (const p of TERMS_PATHS) {
      const httpsUrl = `${httpsBase}${p}`;
      const httpUrl = `${httpBase}${p}`;
      const httpsRes = await fetchText(httpsUrl);
      const httpRes = await fetchText(httpUrl);
      const subscriptionForm = httpsRes.text ? hasSubscriptionForm(httpsRes.text) : (httpRes.text ? hasSubscriptionForm(httpRes.text) : false);
      termsResults.push({ path: p, httpsStatus: httpsRes.status, httpStatus: httpRes.status, subscriptionForm });
    }

    const privacyFound = privacyResults.some(r => r.httpsStatus === 200 || r.httpStatus === 200);
    const termsFound = termsResults.some(r => r.httpsStatus === 200 || r.httpStatus === 200);
    const consentFound = privacyResults.some(r => r.consentCheckbox || r.consentMessage);
    const subscriptionFound = privacyResults.some(r => r.subscriptionForm) || termsResults.some(r => r.subscriptionForm);

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let score = 100;
    const recommendations: string[] = [];

    if (!privacyFound && !termsFound) {
      status = 'fail';
      score = 0;
      recommendations.push('Add privacy policy and terms pages (e.g., /privacy, /terms) and ensure they return HTTP 200.');
    } else {
      if (!privacyFound) {
        status = 'warn';
        score -= 30;
        recommendations.push('Add a privacy policy page (e.g., /privacy or /privacy-policy) that returns HTTP 200.');
      }
      if (!termsFound) {
        status = 'warn';
        score -= 20;
        recommendations.push('Add a terms and conditions page (e.g., /terms) that returns HTTP 200.');
      }
      if (!consentFound) {
        status = 'warn';
        score -= 10;
        recommendations.push('Provide a visible consent checkbox or consent message on privacy or checkout pages.');
      }
      if (!subscriptionFound) {
        // subscription is optional; no score penalty but suggest
        recommendations.push('Consider adding a newsletter subscription form (email capture) if appropriate.');
      }
    }

    return {
      status,
      score: Math.max(0, Math.min(100, score)),
      details: {
        privacyResults,
        termsResults,
        privacyFound,
        termsFound,
        consentFound,
        subscriptionFound
      },
      recommendations
    };
  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: { error: String(error) },
      recommendations: ['Unable to perform compliance checks due to an internal error']
    };
  }
}
