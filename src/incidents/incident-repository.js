const { createId } = require('../utils/ids');

function parseJson(value) {
  return JSON.parse(value);
}

function createIncidentRepository(database) {
  const insertIncident = database.prepare(`
    INSERT INTO incidents
      (id, created_at, updated_at, title, incident_type, severity, confidence,
       summary, narrative, attack_chain, indicators, recommended_actions, status, raw_analysis)
    VALUES ($id, $created_at, $updated_at, $title, $incident_type, $severity, $confidence,
      $summary, $narrative, $attack_chain, $indicators, $recommended_actions, $status, $raw_analysis)
  `);
  const insertIncidentEvent = database.prepare('INSERT OR IGNORE INTO incident_events (incident_id, event_id) VALUES ($incident_id, $event_id)');

  function saveIncident(result, eventIds, rawAnalysis = result) {
    const now = new Date().toISOString();
    const incident = {
      id: createId('inc'),
      created_at: now,
      updated_at: now,
      title: result.summary.slice(0, 120),
      incident_type: result.incident_type,
      severity: result.severity,
      confidence: result.confidence,
      summary: result.summary,
      narrative: result.narrative,
      attack_chain: result.attack_chain,
      indicators: result.indicators,
      recommended_actions: result.recommended_actions,
      status: 'open',
      raw_analysis: rawAnalysis
    };
    database.exec('BEGIN');
    try {
      insertIncident.run({
        $id: incident.id,
        $created_at: now,
        $updated_at: now,
        $title: incident.title,
        $incident_type: incident.incident_type,
        $severity: incident.severity,
        $confidence: incident.confidence,
        $summary: incident.summary,
        $narrative: JSON.stringify(incident.narrative),
        $attack_chain: JSON.stringify(incident.attack_chain),
        $indicators: JSON.stringify(incident.indicators),
        $recommended_actions: JSON.stringify(incident.recommended_actions),
        $status: incident.status,
        $raw_analysis: JSON.stringify(incident.raw_analysis)
      });
      for (const eventId of eventIds) insertIncidentEvent.run({ $incident_id: incident.id, $event_id: eventId });
      database.exec('COMMIT');
      return incident;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function mapIncident(row) {
    if (!row) return null;
    const incident = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      title: row.title,
      incident_type: row.incident_type,
      severity: row.severity,
      confidence: row.confidence,
      summary: row.summary,
      narrative: parseJson(row.narrative),
      attack_chain: parseJson(row.attack_chain),
      indicators: parseJson(row.indicators),
      recommended_actions: parseJson(row.recommended_actions),
      status: row.status,
      event_ids: []
    };
    incident.event_ids = database.prepare('SELECT event_id FROM incident_events WHERE incident_id = ? ORDER BY event_id').all(row.id).map((item) => item.event_id);
    return incident;
  }

  function getIncident(id) { return mapIncident(database.prepare('SELECT * FROM incidents WHERE id = ?').get(id)); }
  function listIncidents(limit = 50) {
    return database.prepare('SELECT * FROM incidents ORDER BY updated_at DESC LIMIT ?').all(Math.min(Math.max(Number(limit) || 50, 1), 100)).map(mapIncident);
  }

  return { saveIncident, getIncident, listIncidents };
}

module.exports = { createIncidentRepository };