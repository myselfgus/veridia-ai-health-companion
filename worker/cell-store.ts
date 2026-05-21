import type { Env } from './core-utils';
import type {
  DashboardSummary,
  DocumentJob,
  DocumentJobMessage,
  DocumentJobStatus,
  MemoryRecord,
  PatientProfile,
  ResearchCapture,
  TherapyCheckin,
  TimelineEvent,
  VaultObject,
  VaultStatus,
} from './types';

const DEFAULT_PATIENT_ID = 'patient-demo';
const SCHEMA_VERSION = 1;

type JsonMap = Record<string, unknown>;
type VaultCreateInput = {
  filename: string;
  mimeType?: string;
  category?: VaultObject['category'];
  content?: string;
  contentBase64?: string;
};

type TimelineCreateInput = Omit<TimelineEvent, 'id' | 'patientId' | 'createdAt'> & {
  id?: string;
};

type MemoryCreateInput = Omit<MemoryRecord, 'id' | 'patientId' | 'revoked' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

type TherapyCreateInput = Pick<TherapyCheckin, 'mood' | 'sleepHours' | 'stress' | 'note'>;

type ResearchCreateInput = Pick<ResearchCapture, 'url' | 'title' | 'status' | 'summary' | 'sourceDomain'> &
  Partial<Pick<ResearchCapture, 'markdownKey' | 'screenshotKey' | 'pdfKey'>>;

const fallback = {
  patients: new Map<string, PatientProfile>(),
  timeline: new Map<string, TimelineEvent[]>(),
  vault: new Map<string, VaultObject[]>(),
  jobs: new Map<string, DocumentJob[]>(),
  memories: new Map<string, MemoryRecord[]>(),
  therapy: new Map<string, TherapyCheckin[]>(),
  research: new Map<string, ResearchCapture[]>(),
};

let schemaReady: Promise<void> | null = null;

export function getDefaultPatientId() {
  return DEFAULT_PATIENT_ID;
}

export function normalizePatientId(value?: string | null) {
  const candidate = value?.trim() || DEFAULT_PATIENT_ID;
  return candidate
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96) || DEFAULT_PATIENT_ID;
}

export function resolvePatientIdFromRequest(request: Request) {
  const url = new URL(request.url);
  return normalizePatientId(
    request.headers.get('x-veridia-patient-id') ||
      request.headers.get('x-patient-id') ||
      url.searchParams.get('patientId'),
  );
}

export async function requirePatientAccess(env: Env, request: Request, route: string) {
  const patientId = resolvePatientIdFromRequest(request);
  if (env.PATIENT_RATE_LIMIT) {
    const verdict = await env.PATIENT_RATE_LIMIT.limit({ key: `${patientId}:${route}` });
    if (!verdict.success) {
      await writeAuditEvent(env, patientId, 'rate_limit', route, 'blocked');
      return { patientId, limited: true };
    }
  }
  return { patientId, limited: false };
}

export function bindingHealth(env: Env): DashboardSummary['bindings'] {
  return {
    d1: Boolean(env.VERIDIA_DB),
    r2: Boolean(env.HEALTH_VAULT),
    queue: Boolean(env.DOCUMENT_QUEUE),
    workflow: Boolean(env.DOCUMENT_WORKFLOW),
    ai: Boolean(env.AI || env.CF_AI_BASE_URL),
    browser: Boolean(env.BROWSER),
    analytics: Boolean(env.ANALYTICS),
    rateLimit: Boolean(env.PATIENT_RATE_LIMIT),
    vectorize: Boolean(env.VECTORIZE),
    aiSearch: Boolean(env.AI_SEARCH),
  };
}

export async function ensureCellSchema(env: Env) {
  if (!env.VERIDIA_DB) return;
  if (!schemaReady) {
    schemaReady = createSchema(env.VERIDIA_DB);
  }
  await schemaReady;
}

async function createSchema(db: D1Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS cell_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      locale TEXT NOT NULL,
      safety_preferences_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cell_sessions (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cell_messages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provenance_json TEXT,
      saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS timeline_events (
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
    )`,
    `CREATE TABLE IF NOT EXISTS vault_objects (
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
    )`,
    `CREATE TABLE IF NOT EXISTS document_jobs (
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
    )`,
    `CREATE TABLE IF NOT EXISTS memories (
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
    )`,
    `CREATE TABLE IF NOT EXISTS therapy_checkins (
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
    )`,
    `CREATE TABLE IF NOT EXISTS research_captures (
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
    )`,
    `CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      action TEXT NOT NULL,
      route TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timeline_patient_time ON timeline_events(patient_id, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_vault_patient_status ON vault_objects(patient_id, status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_patient_doc ON document_jobs(patient_id, document_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memories_patient ON memories(patient_id, revoked, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_therapy_patient_time ON therapy_checkins(patient_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_research_patient_time ON research_captures(patient_id, created_at DESC)`,
    `INSERT OR REPLACE INTO cell_meta (key, value, updated_at) VALUES ('schema_version', ?, ?)`,
  ];

  await db.batch(statements.map((sql, index) => {
    const stmt = db.prepare(sql);
    return index === statements.length - 1 ? stmt.bind(String(SCHEMA_VERSION), now()) : stmt;
  }));
}

export async function getPatientProfile(env: Env, patientId: string): Promise<PatientProfile> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const row = await env.VERIDIA_DB.prepare(
      `SELECT * FROM patients WHERE id = ?`,
    ).bind(patientId).first<Record<string, unknown>>();
    if (row) return rowToPatient(row);
  }

  const existing = fallback.patients.get(patientId);
  if (existing) return existing;

  const created = createDefaultPatient(patientId);
  await upsertPatientProfile(env, created);
  return created;
}

export async function upsertPatientProfile(env: Env, profile: PatientProfile): Promise<PatientProfile> {
  await ensureCellSchema(env);
  const updated = { ...profile, updatedAt: now() };
  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO patients (id, display_name, locale, safety_preferences_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         locale = excluded.locale,
         safety_preferences_json = excluded.safety_preferences_json,
         updated_at = excluded.updated_at`,
    ).bind(
      updated.id,
      updated.displayName,
      updated.locale,
      JSON.stringify(updated.safetyPreferences),
      updated.createdAt,
      updated.updatedAt,
    ).run();
  }
  fallback.patients.set(updated.id, updated);
  return updated;
}

export async function getDashboardSummary(env: Env, patientId: string): Promise<DashboardSummary> {
  const [patient, recentDocuments, recentTimeline, recentMemories, therapyItems, stats, research] = await Promise.all([
    getPatientProfile(env, patientId),
    listVaultObjects(env, patientId, 4),
    listTimelineEvents(env, patientId, 6),
    listMemories(env, patientId, 4),
    listTherapyCheckins(env, patientId, 1),
    getStats(env, patientId),
    listResearchCaptures(env, patientId, 1),
  ]);

  return {
    patient,
    activePlan: makeActivePlan(recentTimeline, therapyItems[0], research[0]),
    recentDocuments,
    recentTimeline,
    recentMemories,
    therapy: {
      lastCheckin: therapyItems[0],
      weeklyPlan: makeWeeklyPlan(therapyItems[0]),
      safetyCopy:
        'Veridia can organize context and support reflection, but it does not diagnose or replace emergency or clinical care.',
    },
    stats,
    bindings: bindingHealth(env),
  };
}

export async function createTimelineEvent(
  env: Env,
  patientId: string,
  input: TimelineCreateInput,
): Promise<TimelineEvent> {
  await ensureCellSchema(env);
  const event: TimelineEvent = {
    ...input,
    id: input.id || crypto.randomUUID(),
    patientId,
    occurredAt: input.occurredAt || now(),
    createdAt: now(),
  };

  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO timeline_events
       (id, patient_id, type, title, summary, source_type, source_id, occurred_at, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.id,
      event.patientId,
      event.type,
      event.title,
      event.summary,
      event.sourceType || null,
      event.sourceId || null,
      event.occurredAt,
      JSON.stringify(event.metadata || {}),
      event.createdAt,
    ).run();
  }

  pushFallback(fallback.timeline, patientId, event);
  return event;
}

export async function listTimelineEvents(env: Env, patientId: string, limit = 40): Promise<TimelineEvent[]> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const rows = await env.VERIDIA_DB.prepare(
      `SELECT * FROM timeline_events WHERE patient_id = ? ORDER BY occurred_at DESC LIMIT ?`,
    ).bind(patientId, limit).all<Record<string, unknown>>();
    return (rows.results || []).map(rowToTimeline);
  }
  return getFallback(fallback.timeline, patientId).slice(0, limit);
}

export async function createVaultObject(env: Env, patientId: string, input: VaultCreateInput): Promise<VaultObject> {
  await ensureCellSchema(env);
  const id = crypto.randomUUID();
  const filename = sanitizeFilename(input.filename || `document-${id}.txt`);
  const mimeType = input.mimeType || 'application/octet-stream';
  const bytes = decodeContent(input);
  const checksum = bytes ? await digestHex(bytes) : undefined;
  const size = bytes?.byteLength || 0;
  const r2Key = `patients/${patientId}/vault/${id}/${filename}`;
  let status: VaultStatus = bytes ? 'queued' : 'metadata_ready';

  if (env.HEALTH_VAULT && bytes) {
    await env.HEALTH_VAULT.put(r2Key, bytes, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        patientId,
        vaultObjectId: id,
        category: input.category || inferCategory(filename, mimeType),
      },
    });
  }

  const object: VaultObject = {
    id,
    patientId,
    r2Key,
    filename,
    mimeType,
    size,
    checksum,
    category: input.category || inferCategory(filename, mimeType),
    status,
    createdAt: now(),
    updatedAt: now(),
  };

  await saveVaultObject(env, object);
  await createTimelineEvent(env, patientId, {
    type: 'document',
    title: `Uploaded ${object.filename}`,
    summary: env.HEALTH_VAULT
      ? 'Document stored in the private Health Vault and queued for intelligence processing.'
      : 'Document metadata saved locally. Connect R2 to store the file payload.',
    sourceType: 'vault',
    sourceId: object.id,
    occurredAt: object.createdAt,
    metadata: { category: object.category, mimeType: object.mimeType, size: object.size },
  });
  return object;
}

export async function saveVaultObject(env: Env, object: VaultObject): Promise<VaultObject> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO vault_objects
       (id, patient_id, r2_key, filename, mime_type, size, checksum, category, status, summary, extracted_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         summary = excluded.summary,
         extracted_text = excluded.extracted_text,
         updated_at = excluded.updated_at`,
    ).bind(
      object.id,
      object.patientId,
      object.r2Key,
      object.filename,
      object.mimeType,
      object.size,
      object.checksum || null,
      object.category,
      object.status,
      object.summary || null,
      object.extractedText || null,
      object.createdAt,
      object.updatedAt,
    ).run();
  }

  const items = getFallback(fallback.vault, object.patientId);
  const index = items.findIndex((item) => item.id === object.id);
  if (index >= 0) items[index] = object;
  else items.unshift(object);
  fallback.vault.set(object.patientId, items);
  return object;
}

export async function getVaultObject(env: Env, patientId: string, documentId: string): Promise<VaultObject | null> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const row = await env.VERIDIA_DB.prepare(
      `SELECT * FROM vault_objects WHERE patient_id = ? AND id = ? AND status != 'deleted'`,
    ).bind(patientId, documentId).first<Record<string, unknown>>();
    return row ? rowToVault(row) : null;
  }
  return getFallback(fallback.vault, patientId).find((item) => item.id === documentId && item.status !== 'deleted') || null;
}

export async function listVaultObjects(env: Env, patientId: string, limit = 40): Promise<VaultObject[]> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const rows = await env.VERIDIA_DB.prepare(
      `SELECT * FROM vault_objects WHERE patient_id = ? AND status != 'deleted' ORDER BY created_at DESC LIMIT ?`,
    ).bind(patientId, limit).all<Record<string, unknown>>();
    return (rows.results || []).map(rowToVault);
  }
  return getFallback(fallback.vault, patientId).filter((item) => item.status !== 'deleted').slice(0, limit);
}

export async function deleteVaultObject(env: Env, patientId: string, documentId: string) {
  const object = await getVaultObject(env, patientId, documentId);
  if (!object) return false;
  const deleted = { ...object, status: 'deleted' as VaultStatus, updatedAt: now() };
  if (env.HEALTH_VAULT) await env.HEALTH_VAULT.delete(object.r2Key).catch(() => undefined);
  await saveVaultObject(env, deleted);
  await writeAuditEvent(env, patientId, 'vault.delete', `/api/vault/files/${documentId}`, 'ok', { documentId });
  return true;
}

export async function createDocumentJob(env: Env, patientId: string, documentId: string, reason = 'upload') {
  await ensureCellSchema(env);
  const job: DocumentJob = {
    id: crypto.randomUUID(),
    patientId,
    documentId,
    status: 'queued',
    stage: reason,
    retryCount: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveDocumentJob(env, job);
  return job;
}

export async function saveDocumentJob(env: Env, job: DocumentJob) {
  await ensureCellSchema(env);
  const updated = { ...job, updatedAt: now() };
  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO document_jobs
       (id, patient_id, document_id, status, stage, retry_count, error, workflow_instance_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         stage = excluded.stage,
         retry_count = excluded.retry_count,
         error = excluded.error,
         workflow_instance_id = excluded.workflow_instance_id,
         updated_at = excluded.updated_at`,
    ).bind(
      updated.id,
      updated.patientId,
      updated.documentId,
      updated.status,
      updated.stage,
      updated.retryCount,
      updated.error || null,
      updated.workflowInstanceId || null,
      updated.createdAt,
      updated.updatedAt,
    ).run();
  }

  const items = getFallback(fallback.jobs, updated.patientId);
  const index = items.findIndex((item) => item.id === updated.id);
  if (index >= 0) items[index] = updated;
  else items.unshift(updated);
  fallback.jobs.set(updated.patientId, items);
  return updated;
}

export async function getDocumentJob(env: Env, patientId: string, jobId: string) {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const row = await env.VERIDIA_DB.prepare(
      `SELECT * FROM document_jobs WHERE patient_id = ? AND id = ?`,
    ).bind(patientId, jobId).first<Record<string, unknown>>();
    return row ? rowToJob(row) : null;
  }
  return getFallback(fallback.jobs, patientId).find((job) => job.id === jobId) || null;
}

export async function getLatestDocumentJob(env: Env, patientId: string, documentId: string) {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const row = await env.VERIDIA_DB.prepare(
      `SELECT * FROM document_jobs WHERE patient_id = ? AND document_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(patientId, documentId).first<Record<string, unknown>>();
    return row ? rowToJob(row) : null;
  }
  return getFallback(fallback.jobs, patientId).find((job) => job.documentId === documentId) || null;
}

export async function enqueueDocumentProcessing(env: Env, message: DocumentJobMessage) {
  if (env.DOCUMENT_QUEUE) {
    await env.DOCUMENT_QUEUE.send(message);
    return { queued: true, workflowStarted: false };
  }
  if (env.DOCUMENT_WORKFLOW) {
    const instance = await env.DOCUMENT_WORKFLOW.create({
      id: `document-${message.jobId}`,
      params: message,
    });
    const job = await getDocumentJob(env, message.patientId, message.jobId);
    if (job) await saveDocumentJob(env, { ...job, workflowInstanceId: instance.id });
    return { queued: false, workflowStarted: true, workflowInstanceId: instance.id };
  }
  await processDocumentJob(env, message);
  return { queued: false, workflowStarted: false, processedInline: true };
}

export async function processDocumentJob(env: Env, message: DocumentJobMessage) {
  const job = await getDocumentJob(env, message.patientId, message.jobId) ||
    await createDocumentJob(env, message.patientId, message.documentId, message.reason || 'manual');
  const object = await getVaultObject(env, message.patientId, message.documentId);
  if (!object) {
    await saveDocumentJob(env, {
      ...job,
      status: 'failed',
      stage: 'load_document',
      error: 'Document not found for patient',
    });
    return;
  }

  await saveDocumentJob(env, { ...job, status: 'processing', stage: 'extract' });
  await saveVaultObject(env, { ...object, status: 'processing', updatedAt: now() });

  const extractedText = await extractTextFromVault(env, object);
  const summary = summarizeDocument(object, extractedText);
  const category = inferCategory(object.filename, object.mimeType);
  const updatedObject = await saveVaultObject(env, {
    ...object,
    category,
    status: 'indexed',
    summary,
    extractedText,
    updatedAt: now(),
  });

  await createTimelineEvent(env, message.patientId, {
    type: 'document',
    title: `${updatedObject.filename} indexed`,
    summary,
    sourceType: 'vault',
    sourceId: updatedObject.id,
    occurredAt: now(),
    metadata: { category, status: 'indexed' },
  });

  await createMemory(env, message.patientId, {
    content: `Document available in vault: ${updatedObject.filename}. ${summary}`,
    category: 'document',
    sourceType: 'document',
    sourceId: updatedObject.id,
    confidence: 0.62,
  });

  await saveDocumentJob(env, { ...job, status: 'indexed', stage: 'complete', error: undefined });
}

export async function createMemory(env: Env, patientId: string, input: MemoryCreateInput): Promise<MemoryRecord> {
  await ensureCellSchema(env);
  const memory: MemoryRecord = {
    ...input,
    id: input.id || crypto.randomUUID(),
    patientId,
    revoked: false,
    createdAt: now(),
    updatedAt: now(),
  };

  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO memories
       (id, patient_id, content, category, source_type, source_id, confidence, revoked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      memory.id,
      memory.patientId,
      memory.content,
      memory.category,
      memory.sourceType,
      memory.sourceId || null,
      memory.confidence,
      memory.revoked ? 1 : 0,
      memory.createdAt,
      memory.updatedAt,
    ).run();
  }

  pushFallback(fallback.memories, patientId, memory);
  await createTimelineEvent(env, patientId, {
    type: 'memory',
    title: 'Memory saved',
    summary: memory.content,
    sourceType: 'memory',
    sourceId: memory.id,
    occurredAt: memory.createdAt,
    metadata: { category: memory.category, confidence: memory.confidence },
  });
  return memory;
}

export async function listMemories(env: Env, patientId: string, limit = 30): Promise<MemoryRecord[]> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const rows = await env.VERIDIA_DB.prepare(
      `SELECT * FROM memories WHERE patient_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT ?`,
    ).bind(patientId, limit).all<Record<string, unknown>>();
    return (rows.results || []).map(rowToMemory);
  }
  return getFallback(fallback.memories, patientId).filter((item) => !item.revoked).slice(0, limit);
}

export async function searchPatientContext(env: Env, patientId: string, query: string) {
  const normalized = query.trim().toLowerCase();
  const [memories, timeline, vault, research] = await Promise.all([
    listMemories(env, patientId, 50),
    listTimelineEvents(env, patientId, 50),
    listVaultObjects(env, patientId, 50),
    listResearchCaptures(env, patientId, 50),
  ]);

  const memoryMatches = memories.filter((item) => includes(item.content, normalized)).slice(0, 8);
  const timelineMatches = timeline.filter((item) => includes(`${item.title} ${item.summary}`, normalized)).slice(0, 8);
  const vaultMatches = vault.filter((item) => includes(`${item.filename} ${item.summary || ''} ${item.extractedText || ''}`, normalized)).slice(0, 8);
  const researchMatches = research.filter((item) => includes(`${item.title} ${item.summary || ''} ${item.url}`, normalized)).slice(0, 8);

  return {
    query,
    patientId,
    enforcedFilter: { patientId },
    source: bindingHealth(env).aiSearch ? 'ai_search_ready' : bindingHealth(env).vectorize ? 'vectorize_ready' : 'd1_fallback',
    memories: memoryMatches,
    timeline: timelineMatches,
    vault: vaultMatches,
    research: researchMatches,
  };
}

export async function createTherapyCheckin(env: Env, patientId: string, input: TherapyCreateInput): Promise<TherapyCheckin> {
  await ensureCellSchema(env);
  const riskFlags = deriveRiskFlags(input.note);
  const checkin: TherapyCheckin = {
    id: crypto.randomUUID(),
    patientId,
    mood: clampNumber(input.mood, 1, 10),
    sleepHours: clampNumber(input.sleepHours, 0, 24),
    stress: clampNumber(input.stress, 1, 10),
    note: input.note || '',
    riskFlags,
    planStep: makePlanStep(input, riskFlags),
    escalationMarker: riskFlags.length > 0,
    createdAt: now(),
  };

  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO therapy_checkins
       (id, patient_id, mood, sleep_hours, stress, note, risk_flags_json, plan_step, escalation_marker, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      checkin.id,
      checkin.patientId,
      checkin.mood,
      checkin.sleepHours,
      checkin.stress,
      checkin.note,
      JSON.stringify(checkin.riskFlags),
      checkin.planStep,
      checkin.escalationMarker ? 1 : 0,
      checkin.createdAt,
    ).run();
  }

  pushFallback(fallback.therapy, patientId, checkin);
  await createTimelineEvent(env, patientId, {
    type: 'checkin',
    title: 'Therapy check-in',
    summary: checkin.planStep,
    sourceType: 'therapy',
    sourceId: checkin.id,
    occurredAt: checkin.createdAt,
    metadata: { mood: checkin.mood, sleepHours: checkin.sleepHours, stress: checkin.stress, riskFlags },
  });
  return checkin;
}

export async function listTherapyCheckins(env: Env, patientId: string, limit = 20): Promise<TherapyCheckin[]> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const rows = await env.VERIDIA_DB.prepare(
      `SELECT * FROM therapy_checkins WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?`,
    ).bind(patientId, limit).all<Record<string, unknown>>();
    return (rows.results || []).map(rowToTherapy);
  }
  return getFallback(fallback.therapy, patientId).slice(0, limit);
}

export async function createResearchCapture(env: Env, patientId: string, input: ResearchCreateInput): Promise<ResearchCapture> {
  await ensureCellSchema(env);
  const capture: ResearchCapture = {
    id: crypto.randomUUID(),
    patientId,
    url: input.url,
    title: input.title,
    status: input.status,
    markdownKey: input.markdownKey,
    screenshotKey: input.screenshotKey,
    pdfKey: input.pdfKey,
    summary: input.summary,
    sourceDomain: input.sourceDomain,
    createdAt: now(),
  };

  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO research_captures
       (id, patient_id, url, title, status, markdown_key, screenshot_key, pdf_key, summary, source_domain, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      capture.id,
      capture.patientId,
      capture.url,
      capture.title,
      capture.status,
      capture.markdownKey || null,
      capture.screenshotKey || null,
      capture.pdfKey || null,
      capture.summary || null,
      capture.sourceDomain,
      capture.createdAt,
    ).run();
  }

  pushFallback(fallback.research, patientId, capture);
  await createTimelineEvent(env, patientId, {
    type: 'research',
    title: capture.title,
    summary: capture.summary || `Source captured from ${capture.sourceDomain}`,
    sourceType: 'browser',
    sourceId: capture.id,
    occurredAt: capture.createdAt,
    metadata: { url: capture.url, status: capture.status },
  });
  return capture;
}

export async function listResearchCaptures(env: Env, patientId: string, limit = 30): Promise<ResearchCapture[]> {
  await ensureCellSchema(env);
  if (env.VERIDIA_DB) {
    const rows = await env.VERIDIA_DB.prepare(
      `SELECT * FROM research_captures WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?`,
    ).bind(patientId, limit).all<Record<string, unknown>>();
    return (rows.results || []).map(rowToResearch);
  }
  return getFallback(fallback.research, patientId).slice(0, limit);
}

export async function writeAuditEvent(
  env: Env,
  patientId: string,
  action: string,
  route: string,
  status: string,
  metadata: JsonMap = {},
) {
  await ensureCellSchema(env);
  const createdAt = now();

  env.ANALYTICS?.writeDataPoint({
    indexes: [patientId],
    blobs: [action, route, status],
    doubles: [Date.now()],
  });

  if (env.VERIDIA_DB) {
    await env.VERIDIA_DB.prepare(
      `INSERT INTO audit_events (id, patient_id, action, route, status, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      patientId,
      action,
      route,
      status,
      JSON.stringify(metadata),
      createdAt,
    ).run();
  }
}

export async function exportPatientData(env: Env, patientId: string) {
  const [patient, timeline, vault, memories, therapy, research] = await Promise.all([
    getPatientProfile(env, patientId),
    listTimelineEvents(env, patientId, 500),
    listVaultObjects(env, patientId, 500),
    listMemories(env, patientId, 500),
    listTherapyCheckins(env, patientId, 500),
    listResearchCaptures(env, patientId, 500),
  ]);

  return {
    exportedAt: now(),
    patientId,
    patient,
    timeline,
    vaultManifest: vault.map(({ extractedText, ...item }) => item),
    memories,
    therapy,
    research,
  };
}

async function getStats(env: Env, patientId: string): Promise<DashboardSummary['stats']> {
  const [documents, timelineEvents, memories, researchCaptures] = await Promise.all([
    listVaultObjects(env, patientId, 500),
    listTimelineEvents(env, patientId, 500),
    listMemories(env, patientId, 500),
    listResearchCaptures(env, patientId, 500),
  ]);

  return {
    documents: documents.length,
    indexedDocuments: documents.filter((item) => item.status === 'indexed').length,
    timelineEvents: timelineEvents.length,
    memories: memories.length,
    researchCaptures: researchCaptures.length,
  };
}

async function extractTextFromVault(env: Env, object: VaultObject) {
  if (!env.HEALTH_VAULT) {
    return object.extractedText || `Metadata only for ${object.filename}.`;
  }

  const stored = await env.HEALTH_VAULT.get(object.r2Key).catch(() => null);
  if (!stored) return `No readable object payload found for ${object.filename}.`;
  if (object.mimeType.startsWith('text/') || object.mimeType.includes('json')) {
    const text = await stored.text();
    return text.slice(0, 8000);
  }
  return `Binary ${object.mimeType} object stored in R2 at ${object.r2Key}. OCR/extraction workflow can enrich this record.`;
}

function summarizeDocument(object: VaultObject, extractedText: string) {
  const preview = extractedText.replace(/\s+/g, ' ').trim().slice(0, 220);
  if (preview && !preview.startsWith('Binary')) {
    return `Indexed ${object.filename}: ${preview}${preview.length >= 220 ? '...' : ''}`;
  }
  return `Indexed ${object.filename} as ${object.category}. Full intelligence can add OCR, classification, embeddings, and review notes.`;
}

function createDefaultPatient(patientId: string): PatientProfile {
  const createdAt = now();
  return {
    id: patientId,
    displayName: 'Demo Patient',
    locale: 'pt-BR',
    safetyPreferences: {
      emergencyCopy: true,
      therapyMode: true,
      dataRegion: 'Cloudflare account default',
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function makeActivePlan(timeline: TimelineEvent[], checkin?: TherapyCheckin, research?: ResearchCapture) {
  if (checkin) return checkin.planStep;
  if (timeline[0]) return `Continue from ${timeline[0].title}: review context and choose the next safe step.`;
  if (research) return `Review captured source ${research.sourceDomain} and attach useful notes to the timeline.`;
  return 'Start with a check-in, upload a health document, or open the companion chat.';
}

function makeWeeklyPlan(checkin?: TherapyCheckin) {
  if (checkin?.escalationMarker) {
    return [
      'Pause and use grounding for the next few minutes.',
      'Contact a trusted person or qualified care resource if risk feels active.',
      'Write one concrete next step that keeps you safe today.',
    ];
  }
  return [
    'One short daily check-in for mood, sleep, stress, and context.',
    'Attach or upload any new exam, PDF, image, or care note.',
    'Convert the week into clinician-ready questions before appointments.',
  ];
}

function makePlanStep(input: TherapyCreateInput, riskFlags: string[]) {
  if (riskFlags.length > 0) {
    return 'A safety-sensitive term appeared. Veridia should keep the response supportive and encourage immediate qualified help if there is active danger.';
  }
  if (input.stress >= 8) return 'Use a brief grounding exercise, lower the next task to one small step, and log what changed.';
  if (input.sleepHours < 5) return 'Prioritize a low-demand day, hydration, and a sleep note to discuss patterns over time.';
  return 'Continue the weekly routine and record one observation that may help your future self or clinician.';
}

function deriveRiskFlags(note: string) {
  const text = note.toLowerCase();
  const flags = ['suicide', 'self-harm', 'harm myself', 'kill myself', 'violence', 'abuse'].filter((term) => text.includes(term));
  return flags;
}

function inferCategory(filename: string, mimeType: string): VaultObject['category'] {
  const lower = filename.toLowerCase();
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (lower.includes('exam') || lower.includes('lab') || lower.includes('result')) return 'exam';
  if (mimeType.startsWith('text/')) return 'note';
  return 'other';
}

function decodeContent(input: VaultCreateInput) {
  if (input.contentBase64) {
    const raw = atob(input.contentBase64);
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }
  if (input.content) return new TextEncoder().encode(input.content);
  return null;
}

async function digestHex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\- ]/g, '_').replace(/\s+/g, '-').slice(0, 160);
}

function getFallback<T>(map: Map<string, T[]>, patientId: string) {
  const existing = map.get(patientId);
  if (existing) return existing;
  const created: T[] = [];
  map.set(patientId, created);
  return created;
}

function pushFallback<T extends { createdAt?: string; occurredAt?: string }>(map: Map<string, T[]>, patientId: string, item: T) {
  const items = getFallback(map, patientId);
  items.unshift(item);
  map.set(patientId, items);
}

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallbackValue: T): T {
  if (!value || typeof value !== 'string') return fallbackValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallbackValue;
  }
}

function includes(value: string, query: string) {
  if (!query) return true;
  const haystack = value.toLowerCase();
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 1);
  if (terms.length === 0) return true;
  return terms.some((term) => haystack.includes(term));
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function rowToPatient(row: Record<string, unknown>): PatientProfile {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    locale: String(row.locale),
    safetyPreferences: parseJson(String(row.safety_preferences_json), { emergencyCopy: true, therapyMode: true }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToTimeline(row: Record<string, unknown>): TimelineEvent {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    type: row.type as TimelineEvent['type'],
    title: String(row.title),
    summary: String(row.summary),
    sourceType: row.source_type ? row.source_type as TimelineEvent['sourceType'] : undefined,
    sourceId: row.source_id ? String(row.source_id) : undefined,
    occurredAt: String(row.occurred_at),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: String(row.created_at),
  };
}

function rowToVault(row: Record<string, unknown>): VaultObject {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    r2Key: String(row.r2_key),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    size: Number(row.size || 0),
    checksum: row.checksum ? String(row.checksum) : undefined,
    category: row.category as VaultObject['category'],
    status: row.status as VaultStatus,
    summary: row.summary ? String(row.summary) : undefined,
    extractedText: row.extracted_text ? String(row.extracted_text) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToJob(row: Record<string, unknown>): DocumentJob {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    documentId: String(row.document_id),
    status: row.status as DocumentJobStatus,
    stage: String(row.stage),
    retryCount: Number(row.retry_count || 0),
    error: row.error ? String(row.error) : undefined,
    workflowInstanceId: row.workflow_instance_id ? String(row.workflow_instance_id) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToMemory(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    content: String(row.content),
    category: row.category as MemoryRecord['category'],
    sourceType: row.source_type as MemoryRecord['sourceType'],
    sourceId: row.source_id ? String(row.source_id) : undefined,
    confidence: Number(row.confidence || 0),
    revoked: Boolean(row.revoked),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToTherapy(row: Record<string, unknown>): TherapyCheckin {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    mood: Number(row.mood || 1),
    sleepHours: Number(row.sleep_hours || 0),
    stress: Number(row.stress || 1),
    note: String(row.note || ''),
    riskFlags: parseJson(row.risk_flags_json, [] as string[]),
    planStep: String(row.plan_step),
    escalationMarker: Boolean(row.escalation_marker),
    createdAt: String(row.created_at),
  };
}

function rowToResearch(row: Record<string, unknown>): ResearchCapture {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    url: String(row.url),
    title: String(row.title),
    status: row.status as ResearchCapture['status'],
    markdownKey: row.markdown_key ? String(row.markdown_key) : undefined,
    screenshotKey: row.screenshot_key ? String(row.screenshot_key) : undefined,
    pdfKey: row.pdf_key ? String(row.pdf_key) : undefined,
    summary: row.summary ? String(row.summary) : undefined,
    sourceDomain: String(row.source_domain),
    createdAt: String(row.created_at),
  };
}
