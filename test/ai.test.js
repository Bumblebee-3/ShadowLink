const assert = require('node:assert/strict');
const test = require('node:test');
const { getAiConfig } = require('../src/ai/ai-config');
const { createAiClient } = require('../src/ai/ai-client');
const { analyzeWithAI } = require('../src/ai/ai-analyzer');
const { parseAiJson } = require('../src/ai/ai-schema');

const event = {
  id: 'evt_ai_test',
  occurred_at: '2026-10-05T10:00:00.000Z',
  source: { type: 'discord', surface: 'web' },
  type: 'message',
  actor: null,
  target: null,
  content: { text: 'Verify your account immediately.' },
  metadata: {}
};

const detection = {
  event_id: event.id,
  risk: { score: 60, level: 'high' },
  signals: [{ type: 'urgency', severity: 'medium', evidence: 'immediately' }],
  urls: []
};

test('defaults to disabled local Ollama configuration', () => {
  const config = getAiConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.provider, 'ollama');
  assert.equal(config.baseUrl, 'http://127.0.0.1:11434/v1');
});

test('supports Groq configuration without embedding a key in config', () => {
  const config = getAiConfig({
    AI_ENABLED: 'true',
    AI_PROVIDER: 'groq',
    AI_MODEL: 'openai/gpt-oss-120b',
    GROQ_API_KEY: 'test-key',
    AI_REASONING_EFFORT: 'medium'
  });
  assert.equal(config.provider, 'groq');
  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(config.model, 'openai/gpt-oss-120b');
  assert.equal(config.reasoningEffort, 'medium');
});

test('parses fenced structured JSON and validates its shape', () => {
  const result = parseAiJson('```json\n{"threat":true,"classification":"phishing","confidence":0.94,"techniques":["urgency"],"assessment":"Pressure to act."}\n```');
  assert.equal(result.threat, true);
  assert.equal(result.confidence, 0.94);
});

test('returns a structured AI result from a compatible client', async () => {
  const result = await analyzeWithAI(event, detection, {
    config: { enabled: true, provider: 'ollama', model: 'qwen3:4b', timeoutMs: 1000 },
    client: { callLLM: async () => '{"threat":true,"classification":"phishing","confidence":0.9,"techniques":["urgency"],"assessment":"Suspicious pressure."}' }
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.threat, true);
});

test('does not fail when the AI provider is unavailable', async () => {
  const result = await analyzeWithAI(event, detection, {
    config: { enabled: true, provider: 'ollama', model: 'qwen3:4b', timeoutMs: 1000 },
    client: { callLLM: async () => { throw new Error('connection refused'); } }
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.error, /connection refused/);
});

test('uses an OpenAI-compatible chat completions request', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: '{}' } }] };
      }
    };
  };
  const client = createAiClient({ baseUrl: 'http://localhost:11434/v1', model: 'qwen3:4b', timeoutMs: 1000 }, fetchImpl);
  assert.equal(await client.callLLM([]), '{}');
  assert.equal(request.url, 'http://localhost:11434/v1/chat/completions');
  const requestBody = JSON.parse(request.options.body);
  assert.equal(requestBody.model, 'qwen3:4b');
  assert.equal(requestBody.max_completion_tokens, 2048);
  assert.equal(requestBody.top_p, 1);
});