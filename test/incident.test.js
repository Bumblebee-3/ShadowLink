const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createEventsRepository } = require('../src/database/events-repository');
const { createGraphRepository } = require('../src/graph/graph-repository');
const { createCorrelationEngine } = require('../src/graph/correlation-engine');
const { createIncidentRepository } = require('../src/incidents/incident-repository');
const { createIncidentFromCorrelation } = require('../src/incidents/incident-engine');
const { eventInputSchema } = require('../src/events/event-schema');
const { normalizeEvent } = require('../src/events/event-normalizer');
const fs = require('node:fs');
const path = require('node:path');

function context() {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  return {
    database,
    events: createEventsRepository(database),
    graph: createGraphRepository(database),
    incidents: createIncidentRepository(database)
  };
}

function makeEvent(time, body) {
  return normalizeEvent(eventInputSchema.parse({
    source: 'gmail',
    type: 'email',
    occurred_at: time,
    actor: { identifier: 'security@example.com' },
    entities: [{ type: 'domain', value: 'evil.example' }],
    data: { content: body }
  }));
}

test('creates and persists a validated attack narrative for correlated events', async () => {
  const { database, events, graph, incidents } = context();
  const first = makeEvent('2026-10-05T10:00:00+00:00', 'Verify your account at https://evil.example/login');
  const second = makeEvent('2026-10-05T10:02:00+00:00', 'Use the same recovery link.');
  events.saveEvent(first);
  events.saveEvent(second);
  const correlation = createCorrelationEngine(graph).correlate(second, { risk: { score: 80, level: 'critical' } });
  const result = await createIncidentFromCorrelation(second, { risk: { score: 80, level: 'critical' } }, correlation, {
    config: { enabled: true, provider: 'ollama', model: 'qwen3:4b' },
    graphRepository: graph,
    incidentRepository: incidents,
    client: { callLLM: async () => JSON.stringify({
      incident_type: 'phishing_campaign',
      severity: 'critical',
      confidence: 0.94,
      summary: 'Correlated credential phishing events share suspicious infrastructure.',
      narrative: [{ event_id: first.id, description: 'The first event contained a suspicious recovery link.' }],
      attack_chain: ['social_engineering', 'credential_harvesting'],
      indicators: ['evil.example', 'same-domain-across-events'],
      recommended_actions: ['Block the suspicious domain', 'Warn the user']
    }) }
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.incident.severity, 'critical');
  assert.deepEqual(incidents.getIncident(result.incident.id).event_ids.sort(), [first.id, second.id].sort());
  assert.equal(incidents.listIncidents().length, 1);
  database.close();
});

test('does not call AI or create an incident for uncorrelated events', async () => {
  const { database, incidents } = context();
  const result = await createIncidentFromCorrelation(
    { id: 'evt_unrelated' },
    {},
    { relationships: [], related_events: [] },
    { config: { enabled: true }, incidentRepository: incidents }
  );

  assert.equal(result.status, 'not_correlated');
  assert.equal(incidents.listIncidents().length, 0);
  database.close();
});