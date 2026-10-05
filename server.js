const { createApp } = require('./src/app');
const config = require('./src/config/config');
const { createDatabase } = require('./src/database/database');
const { createEventsRepository } = require('./src/database/events-repository');
const { createEventBus } = require('./src/events/event-bus');
const { detectEvent } = require('./src/detection/detection-pipeline');
const { getAiConfig } = require('./src/ai/ai-config');
const { analyzeWithAI } = require('./src/ai/ai-analyzer');
const { createGraphRepository } = require('./src/graph/graph-repository');
const { createCorrelationEngine } = require('./src/graph/correlation-engine');
const { createIncidentRepository } = require('./src/incidents/incident-repository');
const { createIncidentFromCorrelation } = require('./src/incidents/incident-engine');
const { createDetectionRepository } = require('./src/detection/detection-repository');
const { createShieldActionsRepository } = require('./src/shield/shield-actions');
const { createShieldService } = require('./src/shield/shield-service');
const { createGmailAdapter } = require('./src/adapters/gmail/gmail-adapter');
const { createGuardianService } = require('./src/guardian/guardian-service');

const database = createDatabase(config.databasePath);
const repository = createEventsRepository(database);
const graphRepository = createGraphRepository(database);
const correlationEngine = createCorrelationEngine(graphRepository);
const incidentsRepository = createIncidentRepository(database);
const detectionRepository = createDetectionRepository(database);
const shieldRepository = createShieldActionsRepository(database);
const shieldService = createShieldService(shieldRepository);
const gmailAdapter = createGmailAdapter(config);
const guardianService = createGuardianService();
const eventBus = createEventBus();
const aiConfig = getAiConfig();
const app = createApp({ repository, eventBus, incidentsRepository, detectionRepository, shieldRepository, graphRepository, gmailAdapter, guardianService });

gmailAdapter.onEvent((event) => eventBus.emit('event.created', event));

const server = app.listen(config.port, config.host, () => {
  console.log('ShadowLink');
  console.log(`Server running on http://${config.host}:${config.port}`);
  console.log(`Database: ${config.databasePath}`);
  console.log(`Gmail: ${gmailAdapter.start().connected ? 'connected' : 'not connected'}`);
});

eventBus.on('event.created', (event) => {
  console.log(`[event.stored] id=${event.id} source=${event.source.type} type=${event.type}`);
  const detection = detectEvent(event);
  const shield = shieldService.evaluate(event, detection);
  const detectionWithAction = { ...detection, action: shield };
  detectionRepository.saveDetection(detectionWithAction);
  eventBus.emit('event.detected', { event, detection: detectionWithAction });
  console.log(`[detection.completed] id=${event.id} risk=${detection.risk.level} score=${detection.risk.score}`);
});

eventBus.on('event.detected', async ({ event, detection }) => {
  const correlation = correlationEngine.correlate(event, detection);
  eventBus.emit('event.correlated', { event, detection, correlation });
  console.log(`[correlation.completed] id=${event.id} relationships=${correlation.relationships.length}`);
});

eventBus.on('event.correlated', async ({ event, detection }) => {
  const ai = await analyzeWithAI(event, detection, { config: aiConfig });
  eventBus.emit('event.ai_analyzed', { event_id: event.id, detection, ai });
  console.log(`[ai.completed] id=${event.id} status=${ai.status} provider=${ai.provider} model=${ai.model}`);
});

eventBus.on('event.correlated', async ({ event, detection, correlation }) => {
  const result = await createIncidentFromCorrelation(event, detection, correlation, {
    config: aiConfig,
    graphRepository,
    incidentRepository: incidentsRepository
  });
  if (result.status === 'completed') {
    eventBus.emit('incident.created', result.incident);
    console.log(`[incident.created] id=${result.incident.id} severity=${result.incident.severity}`);
  } else {
    console.log(`[incident.skipped] event=${event.id} status=${result.status}`);
  }
});

function shutdown() {
  gmailAdapter.stop();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);