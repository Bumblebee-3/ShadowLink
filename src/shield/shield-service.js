const { decideAction } = require('./shield-policy');

function createShieldService(actionsRepository) {
  function evaluate(event, detection) {
    const policy = decideAction(detection);
    const decision = {
      event_id: event.id,
      action: policy.action,
      reason: policy.reason,
      risk: detection.risk,
      metadata: { signals: detection.signals.map((signal) => signal.type) }
    };
    actionsRepository.saveAction(decision);
    return decision;
  }

  return { evaluate };
}

module.exports = { createShieldService };