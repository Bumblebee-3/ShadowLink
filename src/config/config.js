const path = require('node:path');

module.exports = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'shadowlink.db'),
  gmailCredentialsPath: process.env.GMAIL_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json'),
  gmailTokenPath: process.env.GMAIL_TOKEN_PATH || path.join(process.cwd(), 'token.json'),
  gmailPollEnabled: process.env.GMAIL_POLL_ENABLED === 'true',
  gmailPollIntervalMs: Number(process.env.GMAIL_POLL_INTERVAL_MS || 60000),
  gmailQuery: process.env.GMAIL_QUERY || 'in:inbox newer_than:1d'
};