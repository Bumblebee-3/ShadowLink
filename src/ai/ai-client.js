function createAiClient(config, fetchImpl = fetch) {
  async function callLLM(messages, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || config.timeoutMs);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
      const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: options.model || config.model,
          messages,
          temperature: options.temperature ?? config.temperature ?? 0,
          max_completion_tokens: options.maxCompletionTokens || config.maxCompletionTokens || 2048,
          top_p: options.topP ?? config.topP ?? 1,
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          response_format: { type: 'json_object' }
        })
      });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content
        : null;
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no message content');
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { callLLM };
}

module.exports = { createAiClient };