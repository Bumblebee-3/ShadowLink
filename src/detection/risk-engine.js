const severityWeights = { low: 5, medium: 15, high: 25, critical: 35 };

function calculateRisk(signals) {
  const score = Math.min(100, signals.reduce((total, signal) => total + (signal.weight || severityWeights[signal.severity] || 0), 0));
  const level = score >= 70 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { score, level };
}

module.exports = { calculateRisk };