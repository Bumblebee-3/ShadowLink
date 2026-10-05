const assert = require('node:assert/strict');
const test = require('node:test');
const { createGuardianService } = require('../src/guardian/guardian-service');

test('returns deterministic batch verdicts without browser-side threat intelligence', () => {
  const service = createGuardianService();
  const results = service.checkUrls([
    'https://example.com/',
    'https://discord-security.com/login',
    'https://example.com/'
  ], { page_url: 'https://discord.com/' });

  assert.equal(results.length, 2);
  assert.equal(results[0].allowed, true);
  assert.ok(['warning', 'block'].includes(results[1].action));
  assert.ok(results[1].signals.length > 0);
});