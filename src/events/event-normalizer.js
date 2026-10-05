const { createId } = require('../utils/ids');

function firstValue(values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeEvent(input) {
  const data = input.data || {};
  const actorInput = input.actor || {};
  const contentInput = input.content || {};
  const actorName = firstValue([actorInput.name, data.sender, data.author, data.from]);
  const actorIdentifier = firstValue([actorInput.identifier, data.email, data.from]);
  const text = firstValue([
    contentInput.text,
    data.content,
    data.message,
    data.body,
    data.text,
    data.subject
  ]);
  const urls = firstValue([
    contentInput.urls,
    data.urls,
    data.links,
    data.url ? [data.url] : undefined
  ]) || [];
  const targetInput = input.target || null;
  const actor = actorName || actorIdentifier ? {
    type: actorInput.type || (input.source === 'email' ? 'email' : 'person'),
    name: actorName || null,
    identifier: actorIdentifier || null,
    identifier_namespace: actorInput.identifier_namespace || input.source
  } : null;
  const entities = (input.entities || []).filter((entity) => {
    const value = entity && (entity.value || entity.normalized_value);
    return entity && entity.type && String(value || '').trim();
  });

  return {
    id: createId('evt'),
    occurred_at: new Date(input.occurred_at).toISOString(),
    created_at: new Date().toISOString(),
    source: {
      type: input.source,
      surface: input.surface || 'web',
      instance: input.source_instance || null
    },
    type: input.type,
    external_id: input.external_id || null,
    actor,
    target: targetInput ? {
      type: targetInput.type || 'unknown',
      identifier: targetInput.identifier || targetInput.id || null,
      name: targetInput.name || null
    } : null,
    content: {
      ...contentInput,
      text: text || null,
      urls
    },
    metadata: input.metadata || {},
    entities,
    raw_payload: input
  };
}

module.exports = { normalizeEvent };