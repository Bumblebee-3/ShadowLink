const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createDetectionRepository } = require('../src/detection/detection-repository');
const fs = require('node:fs');
const path = require('node:path');

test('persists and retrieves detection results by event ID', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  database.exec(`INSERT INTO events (id, occurred_at, created_at, source_type, source_surface, event_type, content, metadata, raw_payload) VALUES ('evt_browser', '2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z', 'browser', 'tampermonkey', 'navigation', '{}', '{}', '{}')`);
  const repository = createDetectionRepository(database);
  const detection = { event_id: 'evt_browser', risk: { score: 80, level: 'critical' }, signals: [], urls: [] };

  repository.saveDetection(detection);

  assert.deepEqual(repository.getDetection('evt_browser'), detection);
  assert.equal(repository.getDetection('missing'), null);
  database.close();
});