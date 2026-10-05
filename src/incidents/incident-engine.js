const { createAiClient } = require('../ai/ai-client');
const { getAiConfig } = require('../ai/ai-config');
const { buildIncidentMessages } = require('./incident-prompt');
const { parseIncidentJson } = require('./incident-schema');

async function createIncidentFromCorrelation(event, detection, correlation, options = {}) {
  if (!correlation.relationships.length) return { status: 'not_correlated', event_id: event.id };
  const config = options.config || getAiConfig();
  const eventIds = [event.id, ...correlation.related_events];
  const storedEvents = options.graphRepository.listCorrelationEvents(1000)
    .filter((candidate) => eventIds.includes(candidate.id));
  const context = {
    incident_context: {
      time_range: {
        start: storedEvents.map((item) => item.occurred_at).sort()[0],
        end: storedEvents.map((item) => item.occurred_at).sort().at(-1)
      },
      event_count: storedEvents.length
    },
    events: storedEvents.map((item) => ({
      id: item.id,
      occurred_at: item.occurred_at,
      source: item.source,
      type: item.type,
      actor: item.actor,
      target: item.target,
      content: item.content,
      entities: item.entities,
      detection: item.id === event.id ? detection : null
    })),
    relationships: correlation.relationships
  };
  if (!config.enabled) return { status: 'disabled', event_id: event.id, context };

  try {
    const aiConfig = { ...config, model: config.reasoningModel || config.model };
    const client = options.client || createAiClient(aiConfig, options.fetchImpl);
    const content = await client.callLLM(buildIncidentMessages(context), { model: aiConfig.model });
    const result = parseIncidentJson(content);
    const incident = options.incidentRepository.saveIncident(result, eventIds, { provider: config.provider, model: aiConfig.model, result });
    return { status: 'completed', incident, context };
  } catch (error) {
    return { status: 'unavailable', event_id: event.id, error: error.message, context };
  }
}

module.exports = { createIncidentFromCorrelation };