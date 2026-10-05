const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { decideAction } = require('../src/shield/shield-policy');
const { createShieldActionsRepository } = require('../src/shield/shield-actions');
const { createShieldService } = require('../src/shield/shield-service');
const fs = require('node:fs');
const path = require('node:path');

function detection(score, level, signals = []) {
  return { event_id: 'evt_shield', risk: { score, level }, signals, urls: [] };
}

test('applies deterministic allow, warn, and block policy', () => {
  assert.equal(decideAction(detection(10, 'low')).action, 'allow');
  assert.equal(decideAction(detection(50, 'high')).action, 'warn');
  assert.equal(decideAction(detection(70, 'critical')).action, 'block');
  assert.equal(decideAction(detection(25, 'medium', [{ type: 'known_malicious_link' }])).action, 'block');
});

test('persists shield actions for browser retrieval', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  database.exec(`INSERT INTO events (id, occurred_at, created_at, source_type, source_surface, event_type, content, metadata, raw_payload) VALUES ('evt_shield', '2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z', 'browser', 'tampermonkey', 'navigation', '{}', '{}', '{}')`);
  const repository = createShieldActionsRepository(database);
  const service = createShieldService(repository);

  service.evaluate({ id: 'evt_shield' }, detection(85, 'critical'));

  assert.equal(repository.getAction('evt_shield').action, 'block');
  assert.equal(repository.getAction('evt_shield').risk.score, 85);
  database.close();
});