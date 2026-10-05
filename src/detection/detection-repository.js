function parseJson(value) {
  return JSON.parse(value);
}

function createDetectionRepository(database) {
  const save = database.prepare(`
    INSERT INTO detections (event_id, result, created_at)
    VALUES ($event_id, $result, $created_at)
    ON CONFLICT(event_id) DO UPDATE SET result = excluded.result, created_at = excluded.created_at
  `);
  const find = database.prepare('SELECT result FROM detections WHERE event_id = ?');

  function saveDetection(result) {
    save.run({
      $event_id: result.event_id,
      $result: JSON.stringify(result),
      $created_at: new Date().toISOString()
    });
    return result;
  }

  function getDetection(eventId) {
    const row = find.get(eventId);
    return row ? parseJson(row.result) : null;
  }

  return { saveDetection, getDetection };
}

module.exports = { createDetectionRepository };