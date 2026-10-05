function getAiConfig(environment = process.env) {
  const provider = environment.AI_PROVIDER || 'ollama';
  const defaultBaseUrls = {
    ollama: 'http://127.0.0.1:11434/v1',
    groq: 'https://api.groq.com/openai/v1'
  };
  const defaultModels = {
    ollama: 'qwen3:4b',
    groq: 'openai/gpt-oss-20b'
  };
  const apiKeyEnv = environment.AI_API_KEY_ENV || (provider === 'groq' ? 'GROQ_API_KEY' : '');

  return {
    enabled: environment.AI_ENABLED === 'true',
    provider,
    baseUrl: environment.AI_BASE_URL || defaultBaseUrls[provider] || defaultBaseUrls.ollama,
    model: environment.AI_MODEL || defaultModels[provider] || defaultModels.ollama,
    reasoningModel: environment.AI_REASONING_MODEL || environment.AI_MODEL || defaultModels[provider] || defaultModels.ollama,
    apiKey: apiKeyEnv ? environment[apiKeyEnv] : undefined,
    timeoutMs: Number(environment.AI_TIMEOUT_MS || 15000),
    temperature: Number(environment.AI_TEMPERATURE || 0),
    maxCompletionTokens: Number(environment.AI_MAX_COMPLETION_TOKENS || 2048),
    topP: Number(environment.AI_TOP_P || 1),
    reasoningEffort: environment.AI_REASONING_EFFORT || undefined
  };
}

module.exports = { getAiConfig };