/**
 * Core utilities for the Cloudflare Agents template
 * STRICTLY DO NOT MODIFY THIS FILE - Hidden from AI to prevent breaking core functionality
 */
import type { AppController } from './app-controller';
import type { ChatAgent } from './agent';
import type { DocumentJobMessage } from './types';

type WorkflowBinding<T = unknown> = {
  create(options?: { id?: string; params?: T }): Promise<{ id: string; status?: () => Promise<unknown> }>;
  get(id: string): Promise<unknown>;
};

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type SecretsStoreSecretBinding = {
  get(): Promise<string>;
};

export interface Env {
    CF_AI_BASE_URL: string;
    CF_AI_API_KEY?: string;
    CF_AI_API_KEY_SECRET?: SecretsStoreSecretBinding;
    BROWSER_RUN_API_KEY?: SecretsStoreSecretBinding;
    SERPAPI_KEY?: string;
    OPENROUTER_API_KEY?: string;
    CHAT_AGENT: DurableObjectNamespace<ChatAgent>;
    APP_CONTROLLER: DurableObjectNamespace<AppController>;
    VERIDIA_DB?: D1Database;
    HEALTH_VAULT?: R2Bucket;
    DOCUMENT_QUEUE?: Queue<DocumentJobMessage>;
    DOCUMENT_WORKFLOW?: WorkflowBinding<DocumentJobMessage>;
    AI?: Ai;
    BROWSER?: unknown;
    ANALYTICS?: AnalyticsEngineDataset;
    PATIENT_RATE_LIMIT?: RateLimitBinding;
    VECTORIZE?: Vectorize;
    AI_SEARCH?: unknown;
    IMAGES?: unknown;
    STREAM?: unknown;
}

/**
 * Get AppController stub for session management
 * Uses a singleton pattern with fixed ID for consistent routing
 */
export function getAppController(env: Env): DurableObjectStub<AppController> {
  const id = env.APP_CONTROLLER.idFromName("controller");
  return env.APP_CONTROLLER.get(id);
}

/**
 * Register a new chat session with the control plane
 * Called automatically when a new ChatAgent is created
 */
export async function registerSession(env: Env, sessionId: string, title?: string): Promise<void> {
  try {
    const controller = getAppController(env);
    await controller.addSession(sessionId, title);
  } catch (error) {
    console.error('Failed to register session:', error);
    // Don't throw - session should work even if registration fails
  }
}

/**
 * Update session activity timestamp
 * Called when a session receives messages
 */
export async function updateSessionActivity(env: Env, sessionId: string): Promise<void> {
  try {
    const controller = getAppController(env);
    await controller.updateSessionActivity(sessionId);
  } catch (error) {
    console.error('Failed to update session activity:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Unregister a session from the control plane
 * Called when a session is explicitly deleted
 */
export async function unregisterSession(env: Env, sessionId: string): Promise<boolean> {
  try {
    const controller = getAppController(env);
    return await controller.removeSession(sessionId);
  } catch (error) {
    console.error('Failed to unregister session:', error);
    return false;
  }
}
