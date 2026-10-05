const incidentSystemPrompt = `You are the incident reasoning component of ShadowLink.
Analyze only the supplied correlated security-event evidence.
Explain what appears to be happening, how the sequence progressed, the likely objective, and safe recommended next steps.
Separate observed facts from inference in the summary and narrative.
Do not invent attacker identity, organization, location, motivation, malware, or victims.
Return only valid JSON matching the requested schema.`;

function buildIncidentMessages(context) {
  return [
    { role: 'system', content: incidentSystemPrompt },
    { role: 'user', content: JSON.stringify(context) }
  ];
}

module.exports = { buildIncidentMessages, incidentSystemPrompt };