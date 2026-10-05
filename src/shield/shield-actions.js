function createShieldActionsRepository(database) {
  const save = database.prepare(`
    INSERT INTO shield_actions (event_id, action, reason, score, risk_level, metadata, created_at)
    VALUES ($event_id, $action, $reason, $score, $risk_level, $metadata, $created_at)
    ON CONFLICT(event_id) DO UPDATE SET action = excluded.action, reason = excluded.reason,
      score = excluded.score, risk_level = excluded.risk_level, metadata = excluded.metadata,
      created_at = excluded.created_at
  `);
  const find = database.prepare('SELECT * FROM shield_actions WHERE event_id = ?');

  function saveAction(decision) {
    save.run({
      $event_id: decision.event_id,
      $action: decision.action,
      $reason: decision.reason,
      $score: decision.risk.score,
      $risk_level: decision.risk.level,
      $metadata: JSON.stringify(decision.metadata || {}),
      $created_at: new Date().toISOString()
    });
    return decision;
  }

  function getAction(eventId) {
    const row = find.get(eventId);
    return row ? {
      event_id: row.event_id,
      action: row.action,
      reason: row.reason,
      risk: { score: row.score, level: row.risk_level },
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at
    } : null;
  }

  function listActions(limit = 100) {
    return database.prepare('SELECT * FROM shield_actions ORDER BY created_at DESC LIMIT ?').all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map((row) => ({
      event_id: row.event_id,
      action: row.action,
      reason: row.reason,
      risk: { score: row.score, level: row.risk_level },
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at
    }));
  }

  return { saveAction, getAction, listActions };
}

module.exports = { createShieldActionsRepository };