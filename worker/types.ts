export interface ApiResponse<T = unknown> { success: boolean; data?: T; error?: string; }

export type PatientMode =
  | 'ai_twin'
  | 'medical_visit'
  | 'labs'
  | 'routine'
  | 'therapy'
  | 'research';

export type VaultStatus =
  | 'metadata_ready'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'indexed'
  | 'failed'
  | 'deleted';

export type DocumentJobStatus =
  | 'queued'
  | 'processing'
  | 'indexed'
  | 'failed'
  | 'retrying';

export interface PatientProfile {
  id: string;
  displayName: string;
  locale: string;
  safetyPreferences: {
    emergencyCopy: boolean;
    therapyMode: boolean;
    dataRegion?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  patientId: string;
  type: 'symptom' | 'note' | 'document' | 'plan' | 'checkin' | 'appointment' | 'research' | 'memory';
  title: string;
  summary: string;
  sourceType?: 'chat' | 'vault' | 'therapy' | 'browser' | 'manual' | 'memory';
  sourceId?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface VaultObject {
  id: string;
  patientId: string;
  r2Key: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  category: 'exam' | 'image' | 'pdf' | 'note' | 'export' | 'browser' | 'other';
  status: VaultStatus;
  summary?: string;
  extractedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentJob {
  id: string;
  patientId: string;
  documentId: string;
  status: DocumentJobStatus;
  stage: string;
  retryCount: number;
  error?: string;
  workflowInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentJobMessage {
  patientId: string;
  documentId: string;
  jobId: string;
  reason?: string;
}

export interface MemoryRecord {
  id: string;
  patientId: string;
  content: string;
  category: 'preference' | 'clinical_context' | 'routine' | 'therapy' | 'document' | 'other';
  sourceType: 'chat' | 'document' | 'therapy' | 'manual' | 'browser';
  sourceId?: string;
  confidence: number;
  revoked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TherapyCheckin {
  id: string;
  patientId: string;
  mood: number;
  sleepHours: number;
  stress: number;
  note: string;
  riskFlags: string[];
  planStep: string;
  escalationMarker: boolean;
  createdAt: string;
}

export interface ResearchCapture {
  id: string;
  patientId: string;
  url: string;
  title: string;
  status: 'captured' | 'blocked' | 'failed';
  markdownKey?: string;
  screenshotKey?: string;
  pdfKey?: string;
  summary?: string;
  sourceDomain: string;
  createdAt: string;
}

export interface DashboardSummary {
  patient: PatientProfile;
  activePlan: string;
  recentDocuments: VaultObject[];
  recentTimeline: TimelineEvent[];
  recentMemories: MemoryRecord[];
  therapy: {
    lastCheckin?: TherapyCheckin;
    weeklyPlan: string[];
    safetyCopy: string;
  };
  stats: {
    documents: number;
    indexedDocuments: number;
    timelineEvents: number;
    memories: number;
    researchCaptures: number;
  };
  bindings: {
    d1: boolean;
    r2: boolean;
    queue: boolean;
    workflow: boolean;
    ai: boolean;
    browser: boolean;
    analytics: boolean;
    rateLimit: boolean;
    vectorize: boolean;
    aiSearch: boolean;
  };
}

export interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
}

export interface MCPResult {
  content: string;
}

export interface ErrorResult {
  error: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  id: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface ChatState {
  messages: Message[];
  sessionId: string;
  isProcessing: boolean;
  model: string;
  streamingMessage?: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  lastActive: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}
