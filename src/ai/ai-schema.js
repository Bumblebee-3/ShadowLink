const { z } = require('zod');

const aiResultSchema = z.object({
  threat: z.boolean(),
  classification: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  techniques: z.array(z.string().trim().min(1)),
  assessment: z.string().trim().min(1)
});

function parseAiJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI response did not contain a JSON object');
  return aiResultSchema.parse(JSON.parse(trimmed.slice(start, end + 1)));
}

module.exports = { aiResultSchema, parseAiJson };