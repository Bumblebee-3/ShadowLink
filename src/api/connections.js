const express = require('express');

function createConnectionsRouter({ gmailAdapter }) {
  const router = express.Router();

  router.get('/', (request, response) => response.json({ connections: [
    { id: 'gmail', label: 'Gmail', status: gmailAdapter.getStatus() },
    { id: 'discord', label: 'Discord', status: 'placeholder' },
    { id: 'sms', label: 'SMS', status: 'placeholder' },
    { id: 'outlook', label: 'Outlook', status: 'placeholder' },
    { id: 'browser', label: 'Browser Guardian', status: 'available' },
    { id: 'qr', label: 'QR / Camera', status: 'placeholder' }
  ] }));

  router.get('/gmail/start', (request, response) => {
    try {
      return response.json({ authorization_url: gmailAdapter.authorizationUrl() });
    } catch (error) {
      return response.status(503).json({ error: error.message });
    }
  });

  router.get('/gmail/callback', async (request, response) => {
    if (request.query.error) return response.status(400).json({ error: request.query.error });
    if (!request.query.code) return response.status(400).json({ error: 'Missing Gmail OAuth code' });
    try {
      const status = await gmailAdapter.authorize(String(request.query.code));
      return response.redirect(`/dashboard/?gmail=connected&account=${encodeURIComponent(status.account || '')}`);
    } catch (error) {
      return response.status(500).json({ error: `Gmail authorization failed: ${error.message}` });
    }
  });

  router.post('/gmail/poll', async (request, response) => {
    try {
      await gmailAdapter.poll();
      return response.json({ status: 'poll_complete' });
    } catch (error) {
      return response.status(503).json({ status: 'poll_failed', error: error.message });
    }
  });

  return router;
}

module.exports = { createConnectionsRouter };