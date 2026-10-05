const assert = require('node:assert/strict');
const test = require('node:test');
const { extractUrls } = require('../src/detection/url-extractor');
const { detectEvent } = require('../src/detection/detection-pipeline');

test('extracts structured URLs from event content', () => {
  const urls = extractUrls({
    content: {
      text: 'Open https://example.com/login?next=1.',
      urls: ['https://example.com/login?next=1']
    }
  });

  assert.equal(urls.length, 1);
  assert.deepEqual(urls[0], {
    url: 'https://example.com/login?next=1',
    scheme: 'https',
    hostname: 'example.com',
    port: null,
    path: '/login',
    query: 'next=1'
  });
});

test('uses links.js as a known-link detector signal', () => {
  const result = detectEvent({
    id: 'evt_known_link',
    content: { text: 'Claim your Discord gift at https://discord-security.com/login' }
  });

  assert.ok(result.signals.some((signal) => signal.type === 'known_malicious_link'));
  assert.equal(result.urls[0].hostname, 'discord-security.com');
  assert.ok(result.risk.score > 0);
});

test('combines social-engineering signals into an explainable risk result', () => {
  const result = detectEvent({
    id: 'evt_social_engineering',
    content: { text: 'Your Microsoft account will be permanently deleted in 10 minutes. Verify immediately.' }
  });

  assert.ok(result.signals.some((signal) => signal.type === 'urgency'));
  assert.ok(result.signals.some((signal) => signal.type === 'account_threat'));
  assert.ok(result.signals.some((signal) => signal.type === 'credential_request'));
  assert.equal(result.risk.level, 'critical');
});

test('leaves a benign event at low risk', () => {
  const result = detectEvent({
    id: 'evt_benign',
    content: { text: 'The team meeting starts at 10:00.' }
  });

  assert.equal(result.signals.length, 0);
  assert.deepEqual(result.risk, { score: 0, level: 'low' });
});