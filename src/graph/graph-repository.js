function parseJson(value) {
  return JSON.parse(value);
}

function createGraphRepository(database) {
  const insertRelationship = database.prepare(`
    INSERT OR IGNORE INTO event_relationships
      (source_event_id, target_event_id, relationship_type, entity_id, confidence, evidence, created_at)
    VALUES ($source_event_id, $target_event_id, $relationship_type, $entity_id, $confidence, $evidence, $created_at)
  `);

  function listCorrelationEvents(limit = 500) {
    const rows = database.prepare(`
      SELECT events.*, actors.id AS actor_id, actors.type AS actor_type,
        actors.name AS actor_name, actors.identifier AS actor_identifier,
        actors.identifier_namespace AS actor_identifier_namespace
      FROM events
      LEFT JOIN actors ON actors.id = events.actor_id
      ORDER BY events.occurred_at DESC
      LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 500, 1), 1000));

    const entities = database.prepare(`
      SELECT event_entities.event_id, entities.id, entities.type,
        entities.value, entities.normalized_value, event_entities.role
      FROM event_entities
      JOIN entities ON entities.id = event_entities.entity_id
    `).all();
    const entitiesByEvent = new Map();
    for (const entity of entities) {
      if (!entitiesByEvent.has(entity.event_id)) entitiesByEvent.set(entity.event_id, []);
      entitiesByEvent.get(entity.event_id).push({
        id: entity.id,
        type: entity.type,
        value: entity.value,
        normalized_value: entity.normalized_value,
        role: entity.role
      });
    }

    return rows.map((row) => ({
      id: row.id,
      occurred_at: row.occurred_at,
      source: { type: row.source_type, surface: row.source_surface, instance: row.source_instance },
      type: row.event_type,
      actor: row.actor_id ? {
        id: row.actor_id,
        type: row.actor_type,
        name: row.actor_name,
        identifier: row.actor_identifier,
        identifier_namespace: row.actor_identifier_namespace
      } : null,
      target: row.target_identifier || row.target_name ? {
        type: row.target_type,
        identifier: row.target_identifier,
        name: row.target_name
      } : null,
      content: parseJson(row.content),
      entities: entitiesByEvent.get(row.id) || []
    }));
  }

  function saveRelationships(relationships) {
    const createdAt = new Date().toISOString();
    for (const relationship of relationships) {
      insertRelationship.run({
        $source_event_id: relationship.source_event_id,
        $target_event_id: relationship.target_event_id,
        $relationship_type: relationship.relationship_type,
        $entity_id: relationship.entity_id || null,
        $confidence: relationship.confidence,
        $evidence: JSON.stringify(relationship.evidence),
        $created_at: createdAt
      });
    }
    return relationships;
  }

  function getRelationships(eventId) {
    return database.prepare(`
      SELECT source_event_id, target_event_id, relationship_type, entity_id,
        confidence, evidence, created_at
      FROM event_relationships
      WHERE source_event_id = ? OR target_event_id = ?
      ORDER BY created_at DESC
    `).all(eventId, eventId).map((row) => ({
      source_event_id: row.source_event_id,
      target_event_id: row.target_event_id,
      relationship_type: row.relationship_type,
      entity_id: row.entity_id,
      confidence: row.confidence,
      evidence: parseJson(row.evidence),
      created_at: row.created_at
    }));
  }

  function getGraph(limit = 500) {
    const events = listCorrelationEvents(limit);
    const relationships = database.prepare(`
      SELECT source_event_id, target_event_id, relationship_type, confidence, evidence
      FROM event_relationships ORDER BY created_at DESC LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 500, 1), 1000)).map((row) => ({
      source: row.source_event_id,
      target: row.target_event_id,
      relationship: row.relationship_type,
      confidence: row.confidence,
      evidence: parseJson(row.evidence)
    }));
    const nodes = [];
    const nodeIds = new Set();
    for (const event of events) {
      nodes.push({ id: event.id, type: 'event', label: `${event.source.type} / ${event.type}` });
      nodeIds.add(event.id);
      for (const entity of event.entities) {
        if (!nodeIds.has(entity.id)) {
          nodes.push({ id: entity.id, type: entity.type, label: entity.value });
          nodeIds.add(entity.id);
        }
      }
    }
    return { nodes, edges: relationships };
  }

  return { listCorrelationEvents, saveRelationships, getRelationships, getGraph };
}

module.exports = { createGraphRepository };