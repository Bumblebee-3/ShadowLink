function decideAction(detection) {
  const score = detection.risk.score;
  const hasKnownMaliciousLink = detection.signals.some((signal) => signal.type === 'known_malicious_link');
  if (hasKnownMaliciousLink || detection.risk.level === 'critical' || score >= 70) {
    return { action: 'block', reason: hasKnownMaliciousLink ? 'known_malicious_link' : 'critical_risk' };
  }
  if (detection.risk.level === 'high' || score >= 40) {
    return { action: 'warn', reason: 'high_risk' };
  }
  return { action: 'allow', reason: 'low_risk' };
}

module.exports = { decideAction };