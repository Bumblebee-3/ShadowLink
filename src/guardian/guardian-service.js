const { detectEvent } = require('../detection/detection-pipeline');
const { decideAction } = require('../shield/shield-policy');

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch (error) {
    return null;
  }
}

function createGuardianService() {
  function checkUrl(value, context = {}) {
    const url = normalizeUrl(value);
    if (!url) return { url: value, allowed: true, action: 'allow', signals: [], risk: { score: 0, level: 'low' } };
    const event = {
      id: `guardian_${Date.now().toString(36)}`,
      occurred_at: new Date().toISOString(),
      source: { type: 'browser', surface: 'tampermonkey' },
      type: 'navigation',
      actor: null,
      target: null,
      content: { text: `${context.anchor_text || ''} ${url}`.trim(), urls: [url] },
      metadata: { page_url: context.page_url || null }
    };
    const detection = detectEvent(event);
    const policy = decideAction(detection);
    return {
      url,
      allowed: policy.action === 'allow',
      action: policy.action === 'warn' ? 'warning' : policy.action,
      risk: detection.risk,
      signals: detection.signals
    };
  }

  function checkUrls(urls, context = {}) {
    return [...new Set((Array.isArray(urls) ? urls : []).map((url) => String(url)))].map((url) => checkUrl(url, context));
  }

  return { checkUrl, checkUrls };
}

module.exports = { createGuardianService, normalizeUrl };