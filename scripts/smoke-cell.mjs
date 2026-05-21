const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const patientId = process.env.PATIENT_ID || 'patient-smoke-alpha';
const otherPatientId = process.env.OTHER_PATIENT_ID || 'patient-smoke-beta';

async function request(path, init = {}, activePatientId = patientId) {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-veridia-patient-id': activePatientId,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({
    success: false,
    error: `Non-JSON response from ${path}`,
  }));
  if (!response.ok || !payload.success) {
    throw new Error(`${path} ${response.status}: ${payload.error || 'request failed'}`);
  }
  return payload.data;
}

async function waitForIndexed(documentId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await request(`/api/documents/${documentId}/status`);
    if (status.object.status === 'indexed') return status;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return request(`/api/documents/${documentId}/status`);
}

const summary = await request('/api/cell/summary');
console.log('health', summary.patient.id, summary.stats.documents);

const upload = await request('/api/vault/files', {
  method: 'POST',
  body: JSON.stringify({
    filename: 'smoke-sleep-note.txt',
    mimeType: 'text/plain',
    content: 'Smoke test note about sleep, fatigue, caffeine timing, and appointment preparation.',
  }),
});
console.log('upload', upload.object.id, upload.object.status, Boolean(upload.job));

const status = await waitForIndexed(upload.object.id);
console.log('document-status', status.object.status, status.job?.status || 'no-job');

const rag = await request('/api/rag/query', {
  method: 'POST',
  body: JSON.stringify({ query: 'sleep fatigue' }),
});
console.log('rag', rag.enforcedFilter.patientId, rag.source, rag.vault.length + rag.memories.length + rag.timeline.length);

const therapy = await request('/api/therapy/check-in', {
  method: 'POST',
  body: JSON.stringify({ mood: 6, sleepHours: 6, stress: 5, note: 'Stable smoke check-in.' }),
});
console.log('therapy', therapy.id, therapy.escalationMarker);

const capture = await request('/api/browser/capture', {
  method: 'POST',
  body: JSON.stringify({ url: 'https://medlineplus.gov/sleepdisorders.html', screenshot: true, pdf: true }),
});
console.log('browser', capture.status, capture.sourceDomain);

await request('/api/memory/save', {
  method: 'POST',
  body: JSON.stringify({
    content: 'Smoke beta-only memory',
    category: 'other',
    sourceType: 'manual',
  }),
}, otherPatientId);

const isolation = await request(`/api/isolation/smoke?patientId=${patientId}&otherPatientId=${otherPatientId}`);
console.log('isolation', isolation.isolated, isolation.primaryCounts.memories, isolation.otherCounts.memories);

if (!isolation.isolated) {
  throw new Error('Patient isolation smoke failed');
}
