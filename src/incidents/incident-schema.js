const { z } = require('zod');

const incidentResultSchema = z.object({
  incident_type: z.string().trim().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1),
  narrative: z.array(z.object({ event_id: z.string().min(1), description: z.string().trim().min(1) })),
  attack_chain: z.array(z.string().trim().min(1)),
  indicators: z.array(z.string().trim().min(1)),
  recommended_actions: z.array(z.string().trim().min(1))
});

function parseIncidentJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Incident response did not contain a JSON object');
  return incidentResultSchema.parse(JSON.parse(trimmed.slice(start, end + 1)));
}

module.exports = { incidentResultSchema, parseIncidentJson };