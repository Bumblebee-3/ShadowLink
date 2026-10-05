const express = require('express');

function createShieldRouter({ repository }) {
  const router = express.Router();
  router.get('/:eventId', (request, response) => {
    const action = repository.getAction(request.params.eventId);
    if (!action) return response.status(404).json({ error: 'Shield action not found' });
    return response.json(action);
  });
  return router;
}

module.exports = { createShieldRouter };