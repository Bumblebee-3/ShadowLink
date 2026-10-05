const express = require('express');
const { createEventsRouter } = require('./api/events');
const { createIncidentsRouter } = require('./api/incidents');
const { createDetectionsRouter } = require('./api/detections');
const { createShieldRouter } = require('./api/shield');
const { createActionsRouter } = require('./api/actions');
const { createGraphRouter } = require('./api/graph');
const { createConnectionsRouter } = require('./api/connections');
const { createGuardianRouter } = require('./api/guardian');
const path = require('node:path');

function createApp({ repository, eventBus, incidentsRepository, detectionRepository, shieldRepository, graphRepository, gmailAdapter, guardianService }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
  app.get('/userscript/shadowlink.user.js', (request, response) => {
    response.type('application/javascript').sendFile(path.join(__dirname, '../browser/shadowlink.user.js'));
  });

  app.get('/health', (request, response) => {
    response.json({ status: 'ok', service: 'shadowlink' });
  });
  app.use('/api/events', createEventsRouter({ repository, eventBus }));
  if (incidentsRepository) app.use('/api/incidents', createIncidentsRouter({ repository: incidentsRepository }));
  if (detectionRepository) app.use('/api/detections', createDetectionsRouter({ repository: detectionRepository }));
  if (shieldRepository) app.use('/api/shield', createShieldRouter({ repository: shieldRepository }));
  if (shieldRepository) app.use('/api/actions', createActionsRouter({ repository: shieldRepository }));
  if (graphRepository) app.use('/api/graph', createGraphRouter({ repository: graphRepository }));
  if (gmailAdapter) app.use('/api/connections', createConnectionsRouter({ gmailAdapter }));
  if (guardianService) app.use('/api/guardian', createGuardianRouter({ service: guardianService }));
  if (guardianService) {
    app.get('/guardian/warning', (request, response) => {
      const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
      const originalUrl = String(request.query.url || '');
      const parsedSignals = (() => { try { return JSON.parse(String(request.query.signals || '[]')); } catch (error) { return []; } })();
      const proceedUrl = (() => { try { const url = new URL(originalUrl); url.searchParams.set('proceedwithcaution', 'true'); return url.toString(); } catch (error) { return '#'; } })();
      const signals = parsedSignals.map((signal) => `<li>${escapeHtml(signal.type)}: ${escapeHtml(signal.evidence)}</li>`).join('');
      response.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShadowLink warning</title><main style="max-width:680px;margin:10vh auto;padding:32px;font:16px/1.5 system-ui,sans-serif"><p style="font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#167553">ShadowLink</p><h1>Proceed with caution</h1><p>This destination was flagged by ShadowLink before navigation.</p><p><strong>URL</strong><br>${escapeHtml(originalUrl)}</p><p><strong>Risk:</strong> ${escapeHtml(request.query.risk || 'unknown')} / ${escapeHtml(request.query.score || '')}</p><ul>${signals}</ul><p><a href="javascript:history.back()">Go back</a> &nbsp; <a href="${escapeHtml(proceedUrl)}">Proceed anyway</a></p></main>`);
    });
  }
  if (repository && detectionRepository && shieldRepository) {
    app.get('/quarantine/:eventId', (request, response) => {
      const event = repository.getEvent(request.params.eventId);
      const detection = detectionRepository.getDetection(request.params.eventId);
      const action = shieldRepository.getAction(request.params.eventId);
      if (!event || !detection || !action) return response.status(404).send('Quarantine record not found');
      const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
      const originalUrl = detection.urls && detection.urls[0] ? detection.urls[0].url : event.content && event.content.text;
      const proceedUrl = (() => { try { const url = new URL(originalUrl); url.searchParams.set('proceedwithcaution', 'true'); return url.toString(); } catch (error) { return '#'; } })();
      const signals = (detection.signals || []).map((signal) => `<li>${escapeHtml(signal.type)}: ${escapeHtml(signal.evidence)}</li>`).join('');
      response.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>ShadowLink Quarantine</title><main style="max-width:640px;margin:12vh auto;padding:32px;font:16px/1.5 system-ui,sans-serif"><h1>ShadowLink</h1><h2>Navigation blocked</h2><p>This destination was identified as potentially dangerous.</p><p><strong>Risk:</strong> ${escapeHtml(detection.risk.level)} (${escapeHtml(detection.risk.score)})</p><p><strong>Original destination:</strong><br>${escapeHtml(originalUrl)}</p><ul>${signals}</ul><p><a href="/health">Return to safety</a> &nbsp; <a href="${escapeHtml(proceedUrl)}" rel="noreferrer">Continue to destination</a></p></main>`);
    });
  }
  app.use((error, request, response, next) => {
    if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed') {
      return response.status(400).json({ success: false, error: 'Request body must be valid JSON' });
    }
    return next(error);
  });
  return app;
}

module.exports = { createApp };