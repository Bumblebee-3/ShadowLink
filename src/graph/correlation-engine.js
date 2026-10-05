const { correlateEvent } = require('./relationship-detector');

function createCorrelationEngine(graphRepository, options = {}) {
  function correlate(event, detection) {
    return correlateEvent(event, detection, graphRepository, options);
  }

  return { correlate };
}

module.exports = { createCorrelationEngine };