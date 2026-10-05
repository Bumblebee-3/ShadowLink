const { extractUrls } = require('../detection/url-extractor');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function eventFeatures(event) {
  const urls = extractUrls(event).map((url) => ({ ...url, key: url.url }));
  return {
    urls,
    urlKeys: new Set(urls.map((url) => url.key)),
    domains: new Set(urls.map((url) => url.hostname)),
    entities: event.entities || [],
    actorKey: event.actor && event.actor.identifier
      ? `${normalize(event.actor.identifier_namespace)}:${normalize(event.actor.identifier)}`
      : null,
    targetKey: event.target && event.target.identifier
      ? `${normalize(event.target.type)}:${normalize(event.target.identifier)}`
      : null
  };
}

function correlateEvent(event, detection, graphRepository, options = {}) {
  const current = eventFeatures(event);
  const maxAgeSeconds = options.maxAgeSeconds || 3600;
  const candidates = graphRepository.listCorrelationEvents(options.limit || 500);
  const relationships = [];

  for (const candidate of candidates) {
    if (candidate.id === event.id) continue;
    const timeDeltaSeconds = Math.abs(new Date(event.occurred_at) - new Date(candidate.occurred_at)) / 1000;
    if (!Number.isFinite(timeDeltaSeconds) || timeDeltaSeconds > maxAgeSeconds) continue;

    const other = eventFeatures(candidate);
    const sharedEntities = current.entities.filter((entity) => other.entities.some((value) => (
      normalize(entity.type) === normalize(value.type)
      && normalize(entity.normalized_value || entity.value) === normalize(value.normalized_value || value.value)
    )));
    const sharedUrls = [...current.urlKeys].filter((url) => other.urlKeys.has(url));
    const sharedDomains = [...current.domains].filter((domain) => other.domains.has(domain));
    const types = [];

    if (sharedUrls.length) types.push({ type: 'shared_url', weight: 40, evidence: { urls: sharedUrls } });
    if (sharedDomains.length) types.push({ type: 'shared_domain', weight: 30, evidence: { domains: sharedDomains } });
    if (sharedEntities.length) types.push({
      type: 'shared_entity',
      weight: 20,
      entity: sharedEntities[0],
      evidence: { entities: sharedEntities.map((entity) => ({ type: entity.type, value: entity.value })) }
    });
    if (current.actorKey && current.actorKey === other.actorKey) {
      types.push({ type: 'shared_actor', weight: 20, evidence: { actor: current.actorKey } });
    }
    if (current.targetKey && current.targetKey === other.targetKey) {
      types.push({ type: 'shared_target', weight: 20, evidence: { target: current.targetKey } });
    }
    if (!types.length) continue;

    for (const relationship of types) {
      const score = relationship.weight + 10;
      relationships.push({
        source_event_id: event.id,
        target_event_id: candidate.id,
        relationship_type: relationship.type,
        entity_id: relationship.entity ? relationship.entity.id : null,
        confidence: Math.min(1, score / 100),
        evidence: { ...relationship.evidence, time_delta_seconds: timeDeltaSeconds, detection_risk: detection && detection.risk ? detection.risk : null }
      });
    }
  }

  graphRepository.saveRelationships(relationships);
  return {
    event_id: event.id,
    relationships,
    related_events: [...new Set(relationships.map((relationship) => relationship.target_event_id))]
  };
}

module.exports = { correlateEvent };