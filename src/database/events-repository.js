const { createId } = require('../utils/ids');

function parseJson(value) {
  return JSON.parse(value);
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function createEventsRepository(database, options = {}) {
  const insertActor = database.prepare(`
    INSERT INTO actors (id, type, name, identifier, identifier_namespace, identity_key, metadata, created_at)
    VALUES ($id, $type, $name, $identifier, $identifier_namespace, $identity_key, $metadata, $created_at)
  `);
  const insertEntity = database.prepare(`
    INSERT INTO entities (id, type, value, normalized_value, identity_key, metadata, created_at)
    VALUES ($id, $type, $value, $normalized_value, $identity_key, $metadata, $created_at)
  `);
  const insertEvent = database.prepare(`
    INSERT INTO events (id, occurred_at, created_at, source_type, source_surface,
      source_instance, external_id, event_type, actor_id, target_type, target_identifier,
      target_name, content, metadata, raw_payload)
    VALUES ($id, $occurred_at, $created_at, $source_type, $source_surface,
      $source_instance, $external_id, $event_type, $actor_id, $target_type,
      $target_identifier, $target_name, $content, $metadata, $raw_payload)
  `);
  const insertEventEntity = database.prepare(`
    INSERT INTO event_entities (event_id, entity_id, role)
    VALUES ($event_id, $entity_id, $role)
  `);
  const findActor = database.prepare('SELECT * FROM actors WHERE identity_key = ?');
  const findEntity = database.prepare('SELECT * FROM entities WHERE identity_key = ?');
  const findExternalEvent = database.prepare(`
    SELECT events.*, actors.type AS actor_type, actors.name AS actor_name,
      actors.identifier AS actor_identifier, actors.identifier_namespace AS actor_identifier_namespace,
      actors.metadata AS actor_metadata
    FROM events LEFT JOIN actors ON actors.id = events.actor_id
    WHERE source_type = ? AND source_instance = ? AND external_id = ?
  `);

  function saveEvent(event) {
    if (!event || !event.source || !event.source.type || !Array.isArray(event.entities)) {
      throw new TypeError('Invalid canonical event: source and entities are required');
    }

    if (event.external_id && event.source.instance) {
      const existingEvent = findExternalEvent.get(event.source.type, event.source.instance, event.external_id);
      if (existingEvent) {
        return { event: mapEventWithEntities(existingEvent), duplicate: true };
      }
    }

    if (options.beforeInsert) options.beforeInsert(event);

    database.exec('BEGIN');
    let transactionActive = true;
    let actorId = null;
    try {
      if (event.actor) {
        const actorType = event.actor.type || 'unknown';
        const actorIdentifier = normalizeIdentity(event.actor.identifier);
        const actorNamespace = normalizeIdentity(event.actor.identifier_namespace || event.source.type);
        if (actorIdentifier) {
          const actorIdentityKey = `${actorType}:${actorNamespace}:${actorIdentifier}`;
          const existingActor = findActor.get(actorIdentityKey);
          actorId = existingActor ? existingActor.id : createId('actor');
          if (!existingActor) {
            insertActor.run({
              $id: actorId,
              $type: actorType,
              $name: event.actor.name,
              $identifier: event.actor.identifier,
              $identifier_namespace: actorNamespace,
              $identity_key: actorIdentityKey,
              $metadata: JSON.stringify(event.actor.metadata || {}),
              $created_at: event.created_at
            });
          }
        }
          }

      try {
        insertEvent.run({
          $id: event.id,
          $occurred_at: event.occurred_at,
          $created_at: event.created_at,
          $source_type: event.source.type,
          $source_surface: event.source.surface,
          $source_instance: event.source.instance,
          $external_id: event.external_id,
          $event_type: event.type,
          $actor_id: actorId,
          $target_type: event.target ? event.target.type : null,
          $target_identifier: event.target ? event.target.identifier : null,
          $target_name: event.target ? event.target.name : null,
          $content: JSON.stringify(event.content),
          $metadata: JSON.stringify(event.metadata),
          $raw_payload: JSON.stringify(event.raw_payload)
        });
      } catch (error) {
        if (event.external_id && event.source.instance) {
          database.exec('ROLLBACK');
          transactionActive = false;
          const existingEvent = findExternalEvent.get(event.source.type, event.source.instance, event.external_id);
          if (existingEvent) return { event: mapEventWithEntities(existingEvent), duplicate: true };
        }
        throw error;
      }

      for (const entity of event.entities) {
        const entityType = normalizeIdentity(entity.type);
        const entityValue = String(entity.value || '');
        const normalizedValue = normalizeIdentity(entity.normalized_value || entityValue);
        if (!entityType || !normalizedValue) throw new TypeError('Invalid canonical entity: type and value are required');
        const entityIdentityKey = `${entityType}:${normalizedValue}`;
        const existingEntity = findEntity.get(entityIdentityKey);
        const entityId = existingEntity ? existingEntity.id : createId('entity');
        if (!existingEntity) {
          insertEntity.run({
            $id: entityId,
            $type: entityType,
            $value: entityValue,
            $normalized_value: normalizedValue,
            $identity_key: entityIdentityKey,
            $metadata: JSON.stringify(entity.metadata || {}),
            $created_at: event.created_at
          });
        }
        insertEventEntity.run({ $event_id: event.id, $entity_id: entityId, $role: entity.role || 'mentioned' });
      }

      database.exec('COMMIT');
      transactionActive = false;
      return { event, duplicate: false };
    } catch (error) {
      if (transactionActive) database.exec('ROLLBACK');
      throw error;
    }
  }

  function mapEvent(row) {
    if (!row) return null;
    return {
      id: row.id,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      type: row.event_type,
      external_id: row.external_id,
      source: { type: row.source_type, surface: row.source_surface, instance: row.source_instance },
      actor: row.actor_id ? {
        id: row.actor_id,
        type: row.actor_type,
        name: row.actor_name,
        identifier: row.actor_identifier,
        identifier_namespace: row.actor_identifier_namespace,
        metadata: parseJson(row.actor_metadata)
      } : null,
      target: row.target_identifier || row.target_name ? {
        type: row.target_type,
        identifier: row.target_identifier,
        name: row.target_name
      } : null,
      content: parseJson(row.content),
      metadata: parseJson(row.metadata),
      raw_payload: parseJson(row.raw_payload)
    };
  }

  function getEntities(eventId) {
    return database.prepare(`
      SELECT entities.id, entities.type, entities.value, entities.normalized_value,
        event_entities.role
      FROM event_entities
      JOIN entities ON entities.id = event_entities.entity_id
      WHERE event_entities.event_id = ?
      ORDER BY entities.id
    `).all(eventId).map((entity) => ({
      id: entity.id,
      type: entity.type,
      value: entity.value,
      normalized_value: entity.normalized_value,
      role: entity.role
    }));
  }

  function mapEventWithEntities(row) {
    const event = mapEvent(row);
    if (event) event.entities = getEntities(event.id);
    return event;
  }

  function getEvent(id) {
    return mapEventWithEntities(database.prepare(`
      SELECT events.*, actors.type AS actor_type, actors.name AS actor_name,
        actors.identifier AS actor_identifier, actors.identifier_namespace AS actor_identifier_namespace,
        actors.metadata AS actor_metadata
      FROM events LEFT JOIN actors ON actors.id = events.actor_id
      WHERE events.id = ?
    `).get(id));
  }

  function listEvents({ source, type, limit = 50 } = {}) {
    const clauses = [];
    const parameters = [];
    if (source) { clauses.push('source_type = ?'); parameters.push(source); }
    if (type) { clauses.push('event_type = ?'); parameters.push(type); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = database.prepare(`
      SELECT events.*, actors.type AS actor_type, actors.name AS actor_name,
        actors.identifier AS actor_identifier, actors.identifier_namespace AS actor_identifier_namespace,
        actors.metadata AS actor_metadata
      FROM events LEFT JOIN actors ON actors.id = events.actor_id
      ${where} ORDER BY occurred_at DESC LIMIT ${safeLimit}
    `).all(...parameters);
    return rows.map(mapEventWithEntities);
  }

  return { saveEvent, getEvent, listEvents };
}

module.exports = { createEventsRepository };