CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  identifier TEXT,
  identifier_namespace TEXT NOT NULL,
  identity_key TEXT NOT NULL UNIQUE,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  identity_key TEXT NOT NULL UNIQUE,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_surface TEXT NOT NULL,
  source_instance TEXT,
  external_id TEXT,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  target_type TEXT,
  target_identifier TEXT,
  target_name TEXT,
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL,
  UNIQUE (source_type, source_instance, external_id),
  FOREIGN KEY (actor_id) REFERENCES actors(id)
);

CREATE TABLE IF NOT EXISTS event_entities (
  event_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'mentioned',
  PRIMARY KEY (event_id, entity_id, role),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_relationships (
  source_event_id TEXT NOT NULL,
  target_event_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  entity_id TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_event_id, target_event_id, relationship_type),
  FOREIGN KEY (source_event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (target_event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  summary TEXT NOT NULL,
  narrative TEXT NOT NULL DEFAULT '[]',
  attack_chain TEXT NOT NULL DEFAULT '[]',
  indicators TEXT NOT NULL DEFAULT '[]',
  recommended_actions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  raw_analysis TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS incident_events (
  incident_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  PRIMARY KEY (incident_id, event_id),
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS detections (
  event_id TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shield_actions (
  event_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  score INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source_type);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_actors_identity ON actors(type, identifier_namespace, identifier);
CREATE INDEX IF NOT EXISTS idx_entities_identity ON entities(type, normalized_value);
CREATE INDEX IF NOT EXISTS idx_event_relationships_source ON event_relationships(source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_relationships_target ON event_relationships(target_event_id);
CREATE INDEX IF NOT EXISTS idx_event_relationships_type ON event_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_incidents_updated_at ON incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_events_event ON incident_events(event_id);