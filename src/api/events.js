const express = require('express');
const { eventInputSchema } = require('../events/event-schema');
const { normalizeEvent } = require('../events/event-normalizer');
const { logError } = require('../utils/logger');

function createEventsRouter({ repository, eventBus }) {
  const router = express.Router();

  router.post('/', (request, response) => {
    const parsed = eventInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: 'Invalid event',
        details: parsed.error.issues
      });
    }

    try {
      const event = normalizeEvent(parsed.data);
      const result = repository.saveEvent(event);
      if (!result.duplicate) eventBus.emit('event.created', result.event);
      return response.status(result.duplicate ? 200 : 201).json({
        success: true,
        event_id: result.event.id,
        status: result.duplicate ? 'already_accepted' : 'accepted'
      });
    } catch (error) {
      logError('event.error', error);
      return response.status(500).json({ success: false, error: 'Could not store event' });
    }
  });

  router.get('/', (request, response) => {
    const events = repository.listEvents({
      source: request.query.source,
      type: request.query.type,
      limit: request.query.limit
    });
    return response.json({ events });
  });

  router.get('/:id', (request, response) => {
    const event = repository.getEvent(request.params.id);
    if (!event) return response.status(404).json({ error: 'Event not found' });
    return response.json(event);
  });

  return router;
}

module.exports = { createEventsRouter };