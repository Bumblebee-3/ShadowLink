const { extractUrls } = require('./url-extractor');
const { analyzeDomain } = require('./domain-analyzer');
const { analyzeSocialEngineering } = require('./social-engineering');
const { calculateRisk } = require('./risk-engine');

function detectEvent(event) {
  const urls = extractUrls(event);
  const urlSignals = urls.flatMap((url) => analyzeDomain(url));
  const signals = [...urlSignals, ...analyzeSocialEngineering(event)];
  const risk = calculateRisk(signals);

  return {
    event_id: event.id,
    risk,
    signals: signals.map(({ type, severity, evidence, category }) => ({ type, severity, evidence, ...(category ? { category } : {}) })),
    urls
  };
}

module.exports = { detectEvent };