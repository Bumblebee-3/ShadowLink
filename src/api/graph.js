const express = require('express');

function createGraphRouter({ repository }) {
  const router = express.Router();
  router.get('/', (request, response) => response.json(repository.getGraph(request.query.limit)));
  return router;
}

module.exports = { createGraphRouter };