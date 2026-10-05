const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createEventsRepository } = require('../src/database/events-repository');
const { createGraphRepository } = require('../src/graph/graph-repository');
const { createCorrelationEngine } = require('../src/graph/correlation-engine');
const { eventInputSchema } = require('../src/events/event-schema');
const { normalizeEvent } = require('../src/events/event-normalizer');
const fs = require('node:fs');
const path = require('node:path');

function createGraphContext() {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const events = createEventsRepository(database);
  const graph = createGraphRepository(database);
  const engine = createCorrelationEngine(graph);
  return { database, events, graph, engine };
}

function makeEvent(overrides = {}) {
  return normalizeEvent(eventInputSchema.parse({
    source: 'gmail',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    actor: { identifier: 'security@example.com' },
    target: { type: 'user', identifier: 'victim@example.com' },
    entities: [{ type: 'domain', value: 'evil.example', role: 'destination' }],
    data: { content: 'Verify your account at https://evil.example/login' },
    ...overrides
  }));
}

test('correlates events through shared domains, actors, targets, and time', () => {
  const { database, events, graph, engine } = createGraphContext();
  const first = makeEvent();
  const second = makeEvent({ occurred_at: '2026-10-05T10:04:00+00:00' });
  events.saveEvent(first);
  events.saveEvent(second);

  const result = engine.correlate(second, { risk: { score: 80, level: 'critical' } });

  assert.equal(result.related_events.length, 1);
  assert.ok(result.relationships.some((item) => item.relationship_type === 'shared_domain'));
  assert.ok(result.relationships.some((item) => item.relationship_type === 'shared_actor'));
  assert.ok(result.relationships.some((item) => item.relationship_type === 'shared_target'));
  assert.equal(result.relationships[0].evidence.time_delta_seconds, 240);
  assert.equal(graph.getRelationships(second.id).length, result.relationships.length);
  database.close();
});

test('does not correlate unrelated events outside the temporal window', () => {
  const { database, events, engine } = createGraphContext();
  const first = makeEvent({ occurred_at: '2026-10-05T10:00:00+00:00' });
  const second = makeEvent({
    occurred_at: '2026-10-05T12:00:00+00:00',
    actor: { identifier: 'different@example.com' },
    target: { type: 'user', identifier: 'other@example.com' },
    entities: [{ type: 'domain', value: 'other.example' }],
    data: { content: 'A different event.' }
  });
  events.saveEvent(first);
  events.saveEvent(second);

  const result = engine.correlate(second, { risk: { score: 0, level: 'low' } });

  assert.deepEqual(result.relationships, []);
  database.close();
});