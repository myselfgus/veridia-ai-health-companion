import type {
  DashboardSummary,
  MemoryRecord,
  ResearchCapture,
  TherapyCheckin,
  TimelineEvent,
  VaultObject,
} from '../../worker/types';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type RequestOptions = RequestInit & {
  patientId?: string;
};

export const DEFAULT_PATIENT_ID = 'patient-demo';

export async function cellRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { patientId = DEFAULT_PATIENT_ID, headers, ...init } = options;
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-veridia-patient-id': patientId,
      ...(headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' })) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload.data as T;
}

export const cellApi = {
  summary: (patientId: string) =>
    cellRequest<DashboardSummary>('/api/cell/summary', { patientId }),

  timeline: (patientId: string) =>
    cellRequest<TimelineEvent[]>('/api/timeline', { patientId }),

  createTimelineEvent: (
    patientId: string,
    input: Pick<TimelineEvent, 'title' | 'summary'> & Partial<TimelineEvent>,
  ) =>
    cellRequest<TimelineEvent>('/api/timeline', {
      patientId,
      method: 'POST',
      body: JSON.stringify(input),
    }),

  vault: (patientId: string) =>
    cellRequest<VaultObject[]>('/api/vault/files', { patientId }),

  uploadVaultObject: (
    patientId: string,
    input: {
      filename: string;
      mimeType: string;
      category?: VaultObject['category'];
      contentBase64?: string;
      content?: string;
    },
  ) =>
    cellRequest<{ object: VaultObject; job: unknown; processing: unknown }>('/api/vault/files', {
      patientId,
      method: 'POST',
      body: JSON.stringify(input),
    }),

  processDocument: (patientId: string, documentId: string) =>
    cellRequest(`/api/documents/${documentId}/process`, {
      patientId,
      method: 'POST',
      body: JSON.stringify({}),
    }),

  deleteDocument: (patientId: string, documentId: string) =>
    cellRequest<{ deleted: boolean }>(`/api/vault/files/${documentId}`, {
      patientId,
      method: 'DELETE',
    }),

  memories: (patientId: string) =>
    cellRequest<MemoryRecord[]>('/api/memories', { patientId }),

  saveMemory: (patientId: string, content: string) =>
    cellRequest<MemoryRecord>('/api/memory/save', {
      patientId,
      method: 'POST',
      body: JSON.stringify({
        content,
        category: 'clinical_context',
        sourceType: 'manual',
        confidence: 0.72,
      }),
    }),

  ragQuery: (patientId: string, query: string) =>
    cellRequest<{
      memories: MemoryRecord[];
      timeline: TimelineEvent[];
      vault: VaultObject[];
      research: ResearchCapture[];
      enforcedFilter: { patientId: string };
      source: string;
    }>('/api/rag/query', {
      patientId,
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  therapyPlan: (patientId: string) =>
    cellRequest<DashboardSummary['therapy']>('/api/therapy/plan', { patientId }),

  checkIn: (
    patientId: string,
    input: { mood: number; sleepHours: number; stress: number; note: string },
  ) =>
    cellRequest<TherapyCheckin>('/api/therapy/check-in', {
      patientId,
      method: 'POST',
      body: JSON.stringify(input),
    }),

  researchCaptures: (patientId: string) =>
    cellRequest<ResearchCapture[]>('/api/research/captures', { patientId }),

  captureSource: (patientId: string, url: string) =>
    cellRequest<ResearchCapture>('/api/browser/capture', {
      patientId,
      method: 'POST',
      body: JSON.stringify({ url, screenshot: true, pdf: true }),
    }),

  exportData: (patientId: string) =>
    cellRequest<unknown>('/api/export', {
      patientId,
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}
