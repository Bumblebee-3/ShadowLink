const express = require('express');

function createDetectionsRouter({ repository }) {
  const router = express.Router();
  router.get('/:eventId', (request, response) => {
    const detection = repository.getDetection(request.params.eventId);
    if (!detection) return response.status(404).json({ error: 'Detection not found' });
    return response.json(detection);
  });
  return router;
}

module.exports = { createDetectionsRouter };