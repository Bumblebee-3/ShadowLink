const systemPrompt = `You are the AI analysis component of ShadowLink.
Analyze one security event and its deterministic detection signals.
Determine whether the event appears suspicious, its likely threat category, present social-engineering techniques, whether the deterministic assessment is justified, and your confidence.
Return only valid JSON with exactly these fields: threat, classification, confidence, techniques, assessment.
confidence must be a number from 0 to 1. techniques must be an array of short strings.`;

function buildMessages(event, detection) {
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        event: {
          id: event.id,
          occurred_at: event.occurred_at,
          source: event.source,
          type: event.type,
          actor: event.actor,
          target: event.target,
          content: event.content,
          metadata: event.metadata
        },
        detection
      })
    }
  ];
}

module.exports = { buildMessages, systemPrompt };