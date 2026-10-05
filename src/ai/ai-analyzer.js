const { createAiClient } = require('./ai-client');
const { getAiConfig } = require('./ai-config');
const { buildMessages } = require('./ai-prompts');
const { parseAiJson } = require('./ai-schema');

async function analyzeWithAI(event, detection, options = {}) {
  const config = options.config || getAiConfig();
  const baseResult = { provider: config.provider, model: config.model };
  if (!config.enabled) return { status: 'disabled', ...baseResult };

  try {
    const client = options.client || createAiClient(config, options.fetchImpl);
    const content = await client.callLLM(buildMessages(event, detection));
    return { status: 'completed', ...baseResult, ...parseAiJson(content) };
  } catch (error) {
    return { status: 'unavailable', ...baseResult, error: error.message };
  }
}

module.exports = { analyzeWithAI };