// ==UserScript==
// @name         ShadowLink Browser Guardian
// @namespace    shadowlink
// @version      0.2.0
// @description  Browser sensor and enforcement layer for ShadowLink.
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const sentinelUrl = 'http://127.0.0.1:3000';
  const checkEndpoint = `${sentinelUrl}/api/guardian/check`;
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
  const pageText = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 5000);
  const forms = Array.from(document.forms).slice(0, 20).map((form) => ({
    password: Boolean(form.querySelector('input[type="password"]')),
    email: Boolean(form.querySelector('input[type="email"]')),
    action: form.action || null
  }));
  const links = Array.from(document.links)
    .map((link) => link.href)
    .filter((href) => /^https?:/i.test(href))
    .slice(0, 100);
  const event = {
    source: 'browser',
    surface: 'tampermonkey',
    source_instance: `tampermonkey:${location.origin}`,
    external_id: `navigation:${Date.now()}:${location.href}`,
    type: 'navigation',
    occurred_at: new Date().toISOString(),
    data: {
      url: location.href,
      title: document.title,
      hostname: location.hostname,
      protocol: location.protocol,
      referrer: document.referrer || null,
      text: pageText,
      forms,
      links
    }
  };

  function request(method, url, body, callback) {
    GM_xmlhttpRequest({
      method,
      url,
      headers: { 'Content-Type': 'application/json' },
      data: body ? JSON.stringify(body) : undefined,
      onload: (response) => callback(null, response),
      onerror: () => callback(new Error('Sentinel request failed'))
    });
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch (error) { return null; }
  }

  function isApproved(url) {
    try { return new URL(url).searchParams.get('proceedwithcaution') === 'true'; } catch (error) { return false; }
  }

  function checkUrl(url, context) {
    return new Promise((resolve) => {
      request('POST', checkEndpoint, { url, context }, (error, response) => {
        if (error || response.status < 200 || response.status >= 300) {
          resolve({ url, allowed: true, action: 'allow', unavailable: true });
          return;
        }
        try { resolve(JSON.parse(response.responseText)); } catch (parseError) { resolve({ url, allowed: true, action: 'allow', unavailable: true }); }
      });
    });
  }

  function scanPageLinks() {
    const urls = [...new Set([...document.querySelectorAll('a[href]')].map((link) => normalizeUrl(link.href)).filter(Boolean))];
    if (!urls.length) return;
    request('POST', checkEndpoint, { urls, context: { page_url: location.href } }, () => {});
  }

  function showGuardianWarning(url, verdict) {
    const params = new URLSearchParams({
      url,
      risk: verdict.risk && verdict.risk.level || 'unknown',
      score: String(verdict.risk && verdict.risk.score || 0),
      signals: JSON.stringify(verdict.signals || [])
    });
    window.location.href = `${sentinelUrl}/guardian/warning?${params.toString()}`;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    const url = normalizeUrl(link.href);
    if (!url || isApproved(url)) return;
    event.preventDefault();
    event.stopPropagation();
    checkUrl(url, { page_url: location.href, anchor_text: (link.innerText || '').trim() }).then((verdict) => {
      if (!verdict.allowed && (verdict.action === 'warning' || verdict.action === 'block')) {
        sendNavigationEvent({ url, page_url: location.href, action: verdict.action, risk: verdict.risk });
        showGuardianWarning(url, verdict);
        return;
      }
      sendNavigationEvent({ url, page_url: location.href, action: 'allowed' });
      location.href = url;
    });
  }, true);

  function showWarning(detection) {
    if (!detection || !detection.risk) return;
    if (detection.action && detection.action.action === 'block') {
      window.location.replace(`${sentinelUrl}/quarantine/${encodeURIComponent(detection.event_id)}`);
      return;
    }
    if (!detection.action || detection.action.action !== 'warn') return;
    const banner = document.createElement('aside');
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;width: min(360px, calc(100vw - 32px));padding:16px;background:#1f2937;color:#fff;border:2px solid #f59e0b;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    const heading = document.createElement('strong');
    heading.textContent = `ShadowLink: ${detection.risk.level.toUpperCase()} risk`;
    const description = document.createElement('p');
    description.textContent = 'This page has suspicious characteristics.';
    const list = document.createElement('ul');
    for (const signal of (detection.signals || []).slice(0, 4)) {
      const item = document.createElement('li');
      item.textContent = `${signal.type}: ${signal.evidence}`;
      list.appendChild(item);
    }
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss warning');
    dismiss.style.cssText = 'float:right;padding:6px 10px';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => banner.remove());
    banner.append(heading, description, list, dismiss);
    document.documentElement.appendChild(banner);
  }

  function pollDetection(eventId, attempts) {
    request('GET', `${sentinelUrl}/api/detections/${encodeURIComponent(eventId)}`, null, (error, response) => {
      if (!error && response.status === 200) {
        try { showWarning(JSON.parse(response.responseText)); } catch (parseError) { return; }
        return;
      }
      if (attempts > 0) setTimeout(() => pollDetection(eventId, attempts - 1), 500);
    });
  }

  request('POST', `${sentinelUrl}/api/events`, event, (error, response) => {
    if (isApproved(location.href)) {
      sendNavigationEvent({ url: location.href, action: 'proceed_with_caution' });
      return;
    }
    if (error || response.status < 200 || response.status >= 300) return;
    try {
      const accepted = JSON.parse(response.responseText);
      if (accepted.event_id) pollDetection(accepted.event_id, 10);
    } catch (parseError) {
      return;
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanPageLinks, { once: true });
  else scanPageLinks();
})();