const express = require('express');

function createIncidentsRouter({ repository }) {
  const router = express.Router();
  router.get('/', (request, response) => response.json({ incidents: repository.listIncidents(request.query.limit) }));
  router.get('/:id', (request, response) => {
    const incident = repository.getIncident(request.params.id);
    if (!incident) return response.status(404).json({ error: 'Incident not found' });
    return response.json(incident);
  });
  return router;
}

module.exports = { createIncidentsRouter };