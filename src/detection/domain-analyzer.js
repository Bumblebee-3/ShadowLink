const { isMalLink } = require('../links');

const sensitiveKeywords = ['login', 'signin', 'sign-in', 'verify', 'secure', 'account', 'password', 'authenticate', 'billing', 'payment'];
const brands = ['microsoft', 'google', 'apple', 'amazon', 'paypal', 'discord', 'github'];
const substitutionPattern = /(m[i1]crosoft|g[o0]ogle|paypa[l1]|d[i1]sc[o0]rd|g[i1]thub|[a-z]+-[a-z]+-[a-z]+)/i;

function isIpAddress(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function analyzeDomain(url) {
  const signals = [];
  const hostname = url.hostname;
  const tokens = hostname.split('.').filter(Boolean);
  const lowerHostname = hostname.toLowerCase();
  const knownLink = isMalLink(url.url);

  if (knownLink.isMal) {
    signals.push({
      type: 'known_malicious_link',
      severity: 'high',
      evidence: knownLink.link,
      category: knownLink.type
    });
  }
  if (isIpAddress(hostname)) {
    signals.push({ type: 'ip_url', severity: 'medium', evidence: hostname });
  }
  const matchedKeywords = sensitiveKeywords.filter((keyword) => lowerHostname.includes(keyword));
  if (matchedKeywords.length) {
    signals.push({ type: 'sensitive_domain_keyword', severity: 'medium', evidence: matchedKeywords.join(', ') });
  }
  if (tokens.length > 3 || hostname.length > 45) {
    signals.push({ type: 'unusual_domain_structure', severity: 'low', evidence: hostname });
  }
  if ((hostname.match(/-/g) || []).length >= 2) {
    signals.push({ type: 'excessive_hyphens', severity: 'low', evidence: hostname });
  }
  for (const brand of brands) {
    if (lowerHostname.includes(brand) && !lowerHostname.endsWith(`.${brand}.com`) && lowerHostname !== `${brand}.com`) {
      signals.push({ type: 'brand_impersonation', severity: 'high', evidence: brand });
    }
  }
  if (substitutionPattern.test(lowerHostname)) {
    signals.push({ type: 'lookalike_domain', severity: 'high', evidence: hostname });
  }

  return signals;
}

module.exports = { analyzeDomain };