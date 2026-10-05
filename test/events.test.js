const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createEventsRepository } = require('../src/database/events-repository');
const { eventInputSchema } = require('../src/events/event-schema');
const { normalizeEvent } = require('../src/events/event-normalizer');
const { createApp } = require('../src/app');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function requestJson(server, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      port: server.address().port,
      method: 'POST',
      path: '/api/events',
      headers: { 'Content-Type': 'application/json' }
    }, (response) => {
      let payload = '';
      response.on('data', (chunk) => { payload += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(payload) }));
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

function getJson(server, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path: requestPath }, (response) => {
      let payload = '';
      response.on('data', (chunk) => { payload += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(payload) }));
    }).on('error', reject);
  });
}

test('normalizes and persists a source payload', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const input = eventInputSchema.parse({
    source: 'discord',
    type: 'message',
    occurred_at: '2026-10-05T10:00:00+00:00',
    actor: { identifier: 'discord-user-1' },
    data: { sender: 'Discord Security', content: 'Verify here.', url: 'https://example.com' }
  });

  const event = normalizeEvent(input);
  repository.saveEvent(event);
  const stored = repository.getEvent(event.id);

  assert.equal(stored.id, event.id);
  assert.equal(stored.source.type, 'discord');
  assert.equal(stored.actor.name, 'Discord Security');
  assert.deepEqual(stored.content.urls, ['https://example.com']);
  assert.equal(repository.listEvents({ source: 'discord' }).length, 1);
  database.close();
});

test('deduplicates actors and entities and returns targets', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const input = eventInputSchema.parse({
    source: 'gmail',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    target: { type: 'user', identifier: 'local-user' },
    entities: [{ type: 'Domain', value: 'Example.com', role: 'destination' }],
    data: { from: 'security@example.com', body: 'Open the link.' }
  });

  const first = normalizeEvent(input);
  const second = normalizeEvent(input);
  repository.saveEvent(first);
  repository.saveEvent(second);
  const stored = repository.getEvent(second.id);

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM actors').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entities').get().count, 1);
  assert.deepEqual(stored.target, { type: 'user', identifier: 'local-user', name: null });
  assert.deepEqual(stored.entities[0], {
    id: stored.entities[0].id,
    type: 'domain',
    value: 'Example.com',
    normalized_value: 'example.com',
    role: 'destination'
  });
  database.close();
});

test('makes repeated external deliveries idempotent', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const input = eventInputSchema.parse({
    source: 'gmail',
    source_instance: 'account@example.com',
    external_id: 'message-123',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    data: { from: 'security@example.com', body: 'Verify here.' }
  });

  const first = normalizeEvent(input);
  const second = normalizeEvent(input);
  const firstResult = repository.saveEvent(first);
  const secondResult = repository.saveEvent(second);

  assert.equal(firstResult.duplicate, false);
  assert.equal(secondResult.duplicate, true);
  assert.equal(secondResult.event.id, first.id);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
  database.close();
});

test('keeps identical external IDs separate across source instances', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const baseInput = {
    source: 'gmail',
    external_id: 'message-123',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    data: { from: 'security@example.com', body: 'Verify here.' }
  };

  repository.saveEvent(normalizeEvent(eventInputSchema.parse({ ...baseInput, source_instance: 'alice@example.com' })));
  repository.saveEvent(normalizeEvent(eventInputSchema.parse({ ...baseInput, source_instance: 'bob@example.com' })));

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM events').get().count, 2);
  database.close();
});

test('does not persist anonymous actors or empty entities', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const input = eventInputSchema.parse({
    source: 'discord',
    type: 'message',
    occurred_at: '2026-10-05T10:00:00+00:00',
    actor: { type: 'person', name: 'John' },
    entities: [{ type: 'domain', value: 'valid.example' }]
  });

  const event = normalizeEvent(input);
  repository.saveEvent(event);

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM actors').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entities').get().count, 1);
  database.close();
});

test('rejects entities without a type or value', () => {
  const result = eventInputSchema.safeParse({
    source: 'discord',
    type: 'message',
    occurred_at: '2026-10-05T10:00:00+00:00',
    entities: [{ type: 'domain', value: '' }]
  });
  assert.equal(result.success, false);
});

test('does not merge anonymous actors with the same display name', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const input = eventInputSchema.parse({
    source: 'discord',
    type: 'message',
    occurred_at: '2026-10-05T10:00:00+00:00',
    actor: { type: 'person', name: 'John' }
  });

  repository.saveEvent(normalizeEvent(input));
  repository.saveEvent(normalizeEvent(input));

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM actors').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM events').get().count, 2);
  database.close();
});

test('recovers from an external identity conflict at insert time', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  let injected = false;
  const repository = createEventsRepository(database, {
    beforeInsert(event) {
      if (injected) return;
      injected = true;
      database.prepare(`
        INSERT INTO events (id, occurred_at, created_at, source_type, source_surface,
          source_instance, external_id, event_type, content, metadata, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'evt_existing', event.occurred_at, event.created_at, event.source.type,
        event.source.surface, event.source.instance, event.external_id, event.type,
        JSON.stringify({ text: 'original' }), '{}', '{}'
      );
    }
  });
  const event = normalizeEvent(eventInputSchema.parse({
    source: 'gmail',
    source_instance: 'account@example.com',
    external_id: 'message-123',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    data: { content: 'replayed' }
  }));

  const result = repository.saveEvent(event);

  assert.equal(result.duplicate, true);
  assert.equal(result.event.id, 'evt_existing');
  assert.equal(result.event.content.text, 'original');
  database.close();
});

test('rejects malformed canonical events at the repository boundary', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);

  assert.throws(() => repository.saveEvent({ source: { type: 'discord' } }), /Invalid canonical event/);
  assert.throws(() => repository.saveEvent({
    source: { type: 'discord', surface: 'web' },
    id: 'evt_invalid',
    occurred_at: '2026-10-05T10:00:00.000Z',
    created_at: '2026-10-05T10:00:00.000Z',
    type: 'message',
    content: {},
    metadata: {},
    raw_payload: {},
    entities: [{ type: '', value: '' }]
  }), /Invalid canonical entity/);
  database.close();
});

test('rejects unsupported event types', () => {
  const result = eventInputSchema.safeParse({ source: 'banana', type: 'whatever' });
  assert.equal(result.success, false);
});

test('requires occurred_at', () => {
  const result = eventInputSchema.safeParse({ source: 'discord', type: 'message' });
  assert.equal(result.success, false);
});

test('requires source identity fields together', () => {
  const externalOnly = eventInputSchema.safeParse({
    source: 'gmail',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    external_id: 'message-123'
  });
  const instanceOnly = eventInputSchema.safeParse({
    source: 'gmail',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    source_instance: 'account@example.com'
  });
  assert.equal(externalOnly.success, false);
  assert.equal(instanceOnly.success, false);
});

test('emits event.created once for a new event and never for its duplicate', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const eventBus = { emitted: [], emit(name, event) { this.emitted.push({ name, event }); } };
  const server = createApp({ repository, eventBus }).listen(0);
  const payload = {
    source: 'gmail',
    source_instance: 'account@example.com',
    external_id: 'message-123',
    type: 'email',
    occurred_at: '2026-10-05T10:00:00+00:00',
    data: { from: 'security@example.com', body: 'Original' }
  };

  const first = await requestJson(server, payload);
  const second = await requestJson(server, { ...payload, data: { ...payload.data, body: 'Modified replay' } });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(first.body.event_id, second.body.event_id);
  assert.equal(eventBus.emitted.length, 1);
  assert.equal(eventBus.emitted[0].name, 'event.created');
  assert.equal(eventBus.emitted[0].event.content.text, 'Original');
  await new Promise((resolve) => server.close(resolve));
  database.close();
});

test('HTTP validation and event retrieval endpoints expose the canonical event', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(path.join(__dirname, '../src/database/schema.sql'), 'utf8'));
  const repository = createEventsRepository(database);
  const eventBus = { emit() {} };
  const server = createApp({ repository, eventBus }).listen(0);

  const invalid = await requestJson(server, { source: 'discord', type: 'message' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(invalid.body.error, 'Invalid event');

  const accepted = await requestJson(server, {
    source: 'discord',
    type: 'message',
    occurred_at: '2026-10-05T10:00:00+00:00',
    actor: { identifier: 'discord-user-1' },
    data: { content: 'Hello' }
  });
  const list = await getJson(server, '/api/events?source=discord');
  const single = await getJson(server, `/api/events/${accepted.body.event_id}`);

  assert.equal(accepted.statusCode, 201);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.events[0].id, accepted.body.event_id);
  assert.equal(single.statusCode, 200);
  assert.equal(single.body.content.text, 'Hello');
  await new Promise((resolve) => server.close(resolve));
  database.close();
});