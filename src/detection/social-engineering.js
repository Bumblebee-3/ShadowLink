const rules = [
  { type: 'urgency', severity: 'medium', weight: 20, pattern: /urgent|immediately|right now|within \d+ (?:minutes?|hours?)|expires today|act now|last warning|final notice/i },
  { type: 'account_threat', severity: 'high', weight: 20, pattern: /suspended|blocked|deleted|terminated|locked|disabled|legal action|penalty/i },
  { type: 'credential_request', severity: 'high', weight: 20, pattern: /password|log(?:in| ?on)|sign in|verify(?: (?:your )?account)?|authentication|otp|one[- ]time password|security code/i },
  { type: 'financial_pressure', severity: 'medium', weight: 15, pattern: /payment|invoice|refund|billing|bank|transaction|credit card|debit card/i },
  { type: 'authority_impersonation', severity: 'medium', weight: 15, pattern: /security team|administrator|it department|support team|microsoft security|google security/i },
  { type: 'call_to_action', severity: 'low', weight: 10, pattern: /click|verify|open|download|scan|login|sign in|confirm|update/i }
];

function analyzeSocialEngineering(event) {
  const text = event.content && typeof event.content.text === 'string' ? event.content.text : '';
  return rules.filter((rule) => rule.pattern.test(text)).map((rule) => {
    const match = text.match(rule.pattern);
    return { type: rule.type, severity: rule.severity, evidence: match[0], weight: rule.weight };
  });
}

module.exports = { analyzeSocialEngineering };