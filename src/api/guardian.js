const express = require('express');

function createGuardianRouter({ service }) {
  const router = express.Router();
  router.post('/check', (request, response) => {
    const body = request.body || {};
    if (Array.isArray(body.urls)) return response.json({ results: service.checkUrls(body.urls, body.context || {}) });
    if (typeof body.url === 'string') return response.json(service.checkUrl(body.url, body.context || {}));
    return response.status(400).json({ error: 'url or urls is required' });
  });
  return router;
}

module.exports = { createGuardianRouter };