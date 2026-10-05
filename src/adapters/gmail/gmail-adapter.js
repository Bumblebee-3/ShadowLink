const fs = require('node:fs');
const path = require('node:path');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly'
];

function decodeBase64(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(value) {
  return String(value || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) return decodeBase64(payload.body.data);
  for (const part of payload.parts || []) {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) return decodeBase64(part.body.data);
  }
  for (const part of payload.parts || []) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return '';
}

function createOAuthClient(credentials, redirectUri) {
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error('Gmail credentials must contain installed or web OAuth configuration');
  return new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri || config.redirect_uris[0]);
}

function createGmailAdapter(config) {
  let oauthClient;
  let gmail;
  let accountEmail = null;
  let interval;
  let lastError = null;
  let onEvent = () => {};

  function loadClient() {
    if (oauthClient) return oauthClient;
    if (!fs.existsSync(config.gmailCredentialsPath)) throw new Error(`Gmail credentials file not found: ${config.gmailCredentialsPath}`);
    const credentials = JSON.parse(fs.readFileSync(config.gmailCredentialsPath, 'utf8'));
    oauthClient = createOAuthClient(credentials, process.env.GMAIL_REDIRECT_URI);
    if (fs.existsSync(config.gmailTokenPath)) {
      oauthClient.setCredentials(JSON.parse(fs.readFileSync(config.gmailTokenPath, 'utf8')));
      gmail = google.gmail({ version: 'v1', auth: oauthClient });
    }
    oauthClient.on('tokens', (tokens) => {
      saveToken({ ...(oauthClient.credentials || {}), ...tokens });
    });
    return oauthClient;
  }

  function saveToken(tokens) {
    fs.mkdirSync(path.dirname(config.gmailTokenPath), { recursive: true });
    fs.writeFileSync(config.gmailTokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    try { fs.chmodSync(config.gmailTokenPath, 0o600); } catch (error) { /* best effort */ }
  }

  function authorizationUrl() {
    const client = loadClient();
    return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  }

  async function authorize(code) {
    const client = loadClient();
    const result = await client.getToken(code);
    client.setCredentials(result.tokens);
    saveToken({ ...(client.credentials || {}), ...result.tokens });
    gmail = google.gmail({ version: 'v1', auth: client });
    return getStatus();
  }

  async function poll() {
    if (!gmail) throw new Error('Gmail is not connected');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    accountEmail = profile.data.emailAddress || accountEmail;
    const listed = await gmail.users.messages.list({ userId: 'me', q: config.gmailQuery, maxResults: 20 });
    for (const item of listed.data.messages || []) {
      const full = await gmail.users.messages.get({ userId: 'me', id: item.id, format: 'full' });
      const headers = full.data.payload && full.data.payload.headers || [];
      const header = (name) => headers.find((value) => value.name.toLowerCase() === name.toLowerCase())?.value || '';
      const body = stripHtml(extractBody(full.data.payload)).slice(0, 10000);
      const urls = (body.match(/https?:\/\/[^\s)"']+/g) || []).slice(0, 20);
      const date = new Date(header('Date') || Date.now());
      onEvent({
        source: 'gmail', surface: 'email', source_instance: accountEmail || 'gmail-account', external_id: String(full.data.id || item.id),
        type: 'email', occurred_at: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        actor: { type: 'email', identifier: header('From') },
        content: { text: `${header('Subject')}\n${body}`.trim(), urls },
        metadata: { to: header('To'), subject: header('Subject'), thread_id: full.data.threadId }
      });
    }
  }

  function getStatus() {
    return { provider: 'gmail', connected: Boolean(gmail), account: accountEmail, credentials_path: config.gmailCredentialsPath, token_path: config.gmailTokenPath, last_error: lastError };
  }

  function onEventReceived(callback) { onEvent = callback; }
  function start() {
    try {
      loadClient();
      if (!gmail) return getStatus();
      if (config.gmailPollEnabled) {
        poll().catch((error) => { lastError = error.message; });
        interval = setInterval(() => poll().catch((error) => { lastError = error.message; }), config.gmailPollIntervalMs);
      }
    } catch (error) { lastError = error.message; }
    return getStatus();
  }
  function stop() { if (interval) clearInterval(interval); }

  return { authorizationUrl, authorize, poll, getStatus, onEvent: onEventReceived, start, stop };
}

module.exports = { createGmailAdapter, SCOPES };