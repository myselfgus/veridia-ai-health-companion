import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './core-utils';
import {
  createDocumentJob,
  createMemory,
  createResearchCapture,
  createTherapyCheckin,
  createTimelineEvent,
  createVaultObject,
  deleteVaultObject,
  enqueueDocumentProcessing,
  exportPatientData,
  getDashboardSummary,
  getDefaultPatientId,
  getLatestDocumentJob,
  getPatientProfile,
  getVaultObject,
  listMemories,
  listResearchCaptures,
  listTherapyCheckins,
  listTimelineEvents,
  listVaultObjects,
  normalizePatientId,
  requirePatientAccess,
  searchPatientContext,
  upsertPatientProfile,
  writeAuditEvent,
} from './cell-store';
import type { PatientProfile, ResearchCapture } from './types';

const HEALTH_SOURCE_ALLOWLIST = [
  'cdc.gov',
  'nih.gov',
  'nlm.nih.gov',
  'medlineplus.gov',
  'who.int',
  'mayoclinic.org',
  'clevelandclinic.org',
  'nhs.uk',
  'health.harvard.edu',
  'aafp.org',
  'acog.org',
  'heart.org',
  'diabetes.org',
  'cloudflare.com',
];

export function registerCellRoutes(app: Hono<{ Bindings: Env }>) {
  app.get('/api/cell/summary', async (c) => {
    const access = await guard(c, 'cell.summary');
    if (access.response) return access.response;
    const data = await getDashboardSummary(c.env, access.patientId);
    await writeAuditEvent(c.env, access.patientId, 'cell.summary', c.req.path, 'ok');
    return ok(c, data);
  });

  app.get('/api/patient/profile', async (c) => {
    const access = await guard(c, 'patient.profile.read');
    if (access.response) return access.response;
    return ok(c, await getPatientProfile(c.env, access.patientId));
  });

  app.post('/api/patient/profile', async (c) => {
    const access = await guard(c, 'patient.profile.write');
    if (access.response) return access.response;
    const body = await c.req.json<Partial<PatientProfile>>().catch(() => ({}));
    const current = await getPatientProfile(c.env, access.patientId);
    const saved = await upsertPatientProfile(c.env, {
      ...current,
      displayName: body.displayName || current.displayName,
      locale: body.locale || current.locale,
      safetyPreferences: {
        ...current.safetyPreferences,
        ...(body.safetyPreferences || {}),
      },
    });
    await writeAuditEvent(c.env, access.patientId, 'patient.profile.write', c.req.path, 'ok');
    return ok(c, saved);
  });

  app.get('/api/timeline', async (c) => {
    const access = await guard(c, 'timeline.list');
    if (access.response) return access.response;
    const limit = Number(c.req.query('limit') || 40);
    return ok(c, await listTimelineEvents(c.env, access.patientId, limit));
  });

  app.post('/api/timeline', async (c) => {
    const access = await guard(c, 'timeline.create');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.title || !body.summary) return fail(c, 'title and summary are required', 400);
    const event = await createTimelineEvent(c.env, access.patientId, {
      type: body.type || 'note',
      title: String(body.title),
      summary: String(body.summary),
      sourceType: body.sourceType || 'manual',
      sourceId: body.sourceId,
      occurredAt: body.occurredAt || new Date().toISOString(),
      metadata: body.metadata || {},
    });
    await writeAuditEvent(c.env, access.patientId, 'timeline.create', c.req.path, 'ok', { eventId: event.id });
    return ok(c, event, 201);
  });

  app.get('/api/vault/files', async (c) => {
    const access = await guard(c, 'vault.list');
    if (access.response) return access.response;
    return ok(c, await listVaultObjects(c.env, access.patientId, Number(c.req.query('limit') || 40)));
  });

  app.post('/api/vault/upload-intent', async (c) => {
    const access = await guard(c, 'vault.upload_intent');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    const filename = sanitizeFilename(String(body.filename || 'document'));
    const objectId = crypto.randomUUID();
    const key = `patients/${access.patientId}/vault/${objectId}/${filename}`;
    return ok(c, {
      patientId: access.patientId,
      objectId,
      r2Key: key,
      directUpload: false,
      uploadRoute: '/api/vault/files',
      maxBytes: 20 * 1024 * 1024,
      acceptedMimeTypes: ['application/pdf', 'image/*', 'text/*', 'application/json'],
      note: 'Cell 1 stores uploads through the Worker so patient authorization is checked before R2 writes.',
    });
  });

  app.post('/api/vault/files', async (c) => {
    const access = await guard(c, 'vault.upload');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.filename) return fail(c, 'filename is required', 400);

    const object = await createVaultObject(c.env, access.patientId, {
      filename: String(body.filename),
      mimeType: body.mimeType ? String(body.mimeType) : undefined,
      category: body.category,
      content: body.content ? String(body.content) : undefined,
      contentBase64: body.contentBase64 ? String(body.contentBase64) : undefined,
    });

    let job = null;
    let processing = null;
    if (object.status === 'queued') {
      job = await createDocumentJob(c.env, access.patientId, object.id, 'upload');
      processing = await enqueueDocumentProcessing(c.env, {
        patientId: access.patientId,
        documentId: object.id,
        jobId: job.id,
        reason: 'upload',
      });
    }

    await writeAuditEvent(c.env, access.patientId, 'vault.upload', c.req.path, 'ok', {
      documentId: object.id,
      jobId: job?.id,
    });
    return ok(c, { object, job, processing }, 201);
  });

  app.get('/api/vault/files/:documentId', async (c) => {
    const access = await guard(c, 'vault.read');
    if (access.response) return access.response;
    const object = await getVaultObject(c.env, access.patientId, c.req.param('documentId'));
    if (!object) return fail(c, 'Document not found', 404);
    return ok(c, object);
  });

  app.delete('/api/vault/files/:documentId', async (c) => {
    const access = await guard(c, 'vault.delete');
    if (access.response) return access.response;
    const deleted = await deleteVaultObject(c.env, access.patientId, c.req.param('documentId'));
    if (!deleted) return fail(c, 'Document not found', 404);
    return ok(c, { deleted: true });
  });

  app.post('/api/documents/:documentId/process', async (c) => {
    const access = await guard(c, 'document.process');
    if (access.response) return access.response;
    const documentId = c.req.param('documentId');
    const object = await getVaultObject(c.env, access.patientId, documentId);
    if (!object) return fail(c, 'Document not found', 404);
    const job = await createDocumentJob(c.env, access.patientId, documentId, 'manual');
    const processing = await enqueueDocumentProcessing(c.env, {
      patientId: access.patientId,
      documentId,
      jobId: job.id,
      reason: 'manual',
    });
    await writeAuditEvent(c.env, access.patientId, 'document.process', c.req.path, 'ok', { documentId, jobId: job.id });
    return ok(c, { job, processing }, 202);
  });

  app.get('/api/documents/:documentId/status', async (c) => {
    const access = await guard(c, 'document.status');
    if (access.response) return access.response;
    const documentId = c.req.param('documentId');
    const [object, job] = await Promise.all([
      getVaultObject(c.env, access.patientId, documentId),
      getLatestDocumentJob(c.env, access.patientId, documentId),
    ]);
    if (!object) return fail(c, 'Document not found', 404);
    return ok(c, { object, job });
  });

  app.get('/api/memories', async (c) => {
    const access = await guard(c, 'memory.list');
    if (access.response) return access.response;
    return ok(c, await listMemories(c.env, access.patientId, Number(c.req.query('limit') || 30)));
  });

  app.post('/api/memory/save', async (c) => {
    const access = await guard(c, 'memory.save');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.content) return fail(c, 'content is required', 400);
    const memory = await createMemory(c.env, access.patientId, {
      content: String(body.content),
      category: body.category || 'other',
      sourceType: body.sourceType || 'manual',
      sourceId: body.sourceId,
      confidence: typeof body.confidence === 'number' ? body.confidence : 0.7,
    });
    await writeAuditEvent(c.env, access.patientId, 'memory.save', c.req.path, 'ok', { memoryId: memory.id });
    return ok(c, memory, 201);
  });

  app.get('/api/memory/search', async (c) => {
    const access = await guard(c, 'memory.search');
    if (access.response) return access.response;
    const query = c.req.query('q') || '';
    return ok(c, await searchPatientContext(c.env, access.patientId, query));
  });

  app.post('/api/rag/query', async (c) => {
    const access = await guard(c, 'rag.query');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.query) return fail(c, 'query is required', 400);
    const result = await searchPatientContext(c.env, access.patientId, String(body.query));
    await writeAuditEvent(c.env, access.patientId, 'rag.query', c.req.path, 'ok', { queryLength: String(body.query).length });
    return ok(c, result);
  });

  app.post('/api/therapy/check-in', async (c) => {
    const access = await guard(c, 'therapy.checkin');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    const checkin = await createTherapyCheckin(c.env, access.patientId, {
      mood: Number(body.mood || 5),
      sleepHours: Number(body.sleepHours || 7),
      stress: Number(body.stress || 5),
      note: String(body.note || ''),
    });
    await writeAuditEvent(c.env, access.patientId, 'therapy.checkin', c.req.path, 'ok', {
      checkinId: checkin.id,
      escalationMarker: checkin.escalationMarker,
    });
    return ok(c, checkin, 201);
  });

  app.get('/api/therapy/plan', async (c) => {
    const access = await guard(c, 'therapy.plan');
    if (access.response) return access.response;
    const summary = await getDashboardSummary(c.env, access.patientId);
    return ok(c, summary.therapy);
  });

  app.get('/api/research/captures', async (c) => {
    const access = await guard(c, 'research.list');
    if (access.response) return access.response;
    return ok(c, await listResearchCaptures(c.env, access.patientId, Number(c.req.query('limit') || 30)));
  });

  app.post('/api/browser/capture', async (c) => {
    const access = await guard(c, 'browser.capture');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.url) return fail(c, 'url is required', 400);
    const capture = await captureResearchSource(c.env, access.patientId, String(body.url), {
      screenshot: Boolean(body.screenshot),
      pdf: Boolean(body.pdf),
    });
    const status = capture.status === 'blocked' ? 403 : 201;
    await writeAuditEvent(c.env, access.patientId, 'browser.capture', c.req.path, capture.status, { url: body.url });
    return ok(c, capture, status);
  });

  app.post('/api/browser/research', async (c) => {
    const access = await guard(c, 'browser.research');
    if (access.response) return access.response;
    const body = await c.req.json().catch(() => ({}));
    if (!body.url && !body.query) return fail(c, 'url or query is required', 400);
    if (body.url) {
      const capture = await captureResearchSource(c.env, access.patientId, String(body.url), {
        screenshot: true,
        pdf: true,
      });
      return ok(c, { mode: 'url', capture }, capture.status === 'blocked' ? 403 : 201);
    }
    return ok(c, {
      mode: 'query',
      query: String(body.query),
      allowlist: HEALTH_SOURCE_ALLOWLIST,
      nextStep: 'Choose an allowlisted source URL so Browser Run can capture markdown, PDF, and screenshots with provenance.',
    });
  });

  app.post('/api/export', async (c) => {
    const access = await guard(c, 'patient.export');
    if (access.response) return access.response;
    const data = await exportPatientData(c.env, access.patientId);
    await writeAuditEvent(c.env, access.patientId, 'patient.export', c.req.path, 'ok');
    return ok(c, data);
  });

  app.get('/api/isolation/smoke', async (c) => {
    const primaryPatientId = normalizePatientId(c.req.query('patientId') || getDefaultPatientId());
    const otherPatientId = normalizePatientId(c.req.query('otherPatientId') || 'patient-isolation-control');
    const [primary, other] = await Promise.all([
      searchPatientContext(c.env, primaryPatientId, ''),
      searchPatientContext(c.env, otherPatientId, ''),
    ]);
    return ok(c, {
      primaryPatientId,
      otherPatientId,
      isolated: primary.patientId !== other.patientId,
      primaryCounts: {
        memories: primary.memories.length,
        timeline: primary.timeline.length,
        vault: primary.vault.length,
      },
      otherCounts: {
        memories: other.memories.length,
        timeline: other.timeline.length,
        vault: other.vault.length,
      },
      enforcedFilters: [primary.enforcedFilter, other.enforcedFilter],
    });
  });
}

async function guard(c: Context<{ Bindings: Env }>, action: string) {
  const access = await requirePatientAccess(c.env, c.req.raw, action);
  if (access.limited) {
    return {
      patientId: access.patientId,
      response: c.json({ success: false, error: 'Patient route rate limit exceeded' }, { status: 429 }),
    };
  }
  return { patientId: access.patientId, response: null };
}

async function captureResearchSource(
  env: Env,
  patientId: string,
  rawUrl: string,
  options: { screenshot: boolean; pdf: boolean },
): Promise<ResearchCapture> {
  const checked = checkAllowedSource(rawUrl);
  if (!checked.ok) {
    return createResearchCapture(env, patientId, {
      url: rawUrl,
      title: 'Blocked source',
      status: 'blocked',
      summary: checked.reason,
      sourceDomain: checked.domain || 'unknown',
    });
  }

  const url = checked.url;
  const domain = url.hostname.replace(/^www\./, '');
  const captureId = crypto.randomUUID();
  let title = domain;
  let markdown = `# ${domain}\n\nCapture requested for ${url.toString()}.`;
  let summary = `Captured allowlisted source ${domain}.`;

  try {
    const page = await fetch(url.toString(), {
      headers: { 'user-agent': 'VeridiaResearchBot/1.0 (+https://veridia.health)' },
    });
    const text = await page.text();
    title = extractTitle(text) || title;
    markdown = htmlToMarkdown(title, text, url.toString());
    summary = markdown.replace(/\s+/g, ' ').slice(0, 260);
  } catch (error) {
    summary = `Source fetch failed; Browser Run binding can retry this capture. ${error instanceof Error ? error.message : String(error)}`;
  }

  let markdownKey: string | undefined;
  let screenshotKey: string | undefined;
  let pdfKey: string | undefined;

  if (env.HEALTH_VAULT) {
    markdownKey = `patients/${patientId}/browser/${captureId}/capture.md`;
    await env.HEALTH_VAULT.put(markdownKey, markdown, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: { patientId, sourceUrl: url.toString(), sourceDomain: domain },
    });

    if (options.screenshot) {
      screenshotKey = `patients/${patientId}/browser/${captureId}/screenshot-request.json`;
      await env.HEALTH_VAULT.put(
        screenshotKey,
        JSON.stringify({ url: url.toString(), requestedAt: new Date().toISOString(), bindingReady: Boolean(env.BROWSER) }),
        { httpMetadata: { contentType: 'application/json' } },
      );
    }

    if (options.pdf) {
      pdfKey = `patients/${patientId}/browser/${captureId}/pdf-request.json`;
      await env.HEALTH_VAULT.put(
        pdfKey,
        JSON.stringify({ url: url.toString(), requestedAt: new Date().toISOString(), bindingReady: Boolean(env.BROWSER) }),
        { httpMetadata: { contentType: 'application/json' } },
      );
    }
  }

  return createResearchCapture(env, patientId, {
    url: url.toString(),
    title,
    status: 'captured',
    markdownKey,
    screenshotKey,
    pdfKey,
    summary,
    sourceDomain: domain,
  });
}

function checkAllowedSource(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return { ok: false as const, reason: 'Only HTTP and HTTPS sources can be captured.', domain: url.hostname };
    }
    const domain = url.hostname.replace(/^www\./, '').toLowerCase();
    const allowed = HEALTH_SOURCE_ALLOWLIST.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`));
    if (!allowed) {
      return {
        ok: false as const,
        reason: `Source ${domain} is outside the Cell 1 health research allowlist.`,
        domain,
      };
    }
    return { ok: true as const, url, domain };
  } catch {
    return { ok: false as const, reason: 'Invalid URL.', domain: undefined };
  }
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).trim().slice(0, 140) : '';
}

function htmlToMarkdown(title: string, html: string, url: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<\/(p|div|section|article|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const body = decodeHtml(cleaned).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
  return `# ${title}\n\nSource: ${url}\n\n${body}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\- ]/g, '_').replace(/\s+/g, '-').slice(0, 160);
}

function ok<T>(c: { json: (body: unknown, init?: { status?: number }) => Response }, data: T, status = 200) {
  return c.json({ success: true, data }, { status });
}

function fail(c: { json: (body: unknown, init?: { status?: number }) => Response }, error: string, status = 500) {
  return c.json({ success: false, error }, { status });
}
