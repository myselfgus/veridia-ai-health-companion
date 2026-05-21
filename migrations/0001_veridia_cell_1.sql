CREATE TABLE IF NOT EXISTS cell_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL,
  safety_preferences_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cell_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cell_messages (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provenance_json TEXT,
  saved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_objects (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  checksum TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  extracted_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_jobs (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  error TEXT,
  workflow_instance_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  confidence REAL NOT NULL,
  revoked INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS therapy_checkins (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  mood INTEGER NOT NULL,
  sleep_hours REAL NOT NULL,
  stress INTEGER NOT NULL,
  note TEXT NOT NULL,
  risk_flags_json TEXT NOT NULL,
  plan_step TEXT NOT NULL,
  escalation_marker INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_captures (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  markdown_key TEXT,
  screenshot_key TEXT,
  pdf_key TEXT,
  summary TEXT,
  source_domain TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  action TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cell_sessions_patient_time ON cell_sessions(patient_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cell_messages_patient_session ON cell_messages(patient_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_patient_time ON timeline_events(patient_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_patient_status ON vault_objects(patient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_patient_doc ON document_jobs(patient_id, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_patient ON memories(patient_id, revoked, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_therapy_patient_time ON therapy_checkins(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_patient_time ON research_captures(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient_time ON audit_events(patient_id, created_at DESC);

INSERT OR REPLACE INTO cell_meta (key, value, updated_at)
VALUES ('schema_version', '1', datetime('now'));
