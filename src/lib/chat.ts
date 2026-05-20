import type { Message, ChatState, ToolCall, WeatherResult, MCPResult, ErrorResult, SessionInfo } from '../../worker/types';
export interface ChatResponse {
  success: boolean;
  data?: ChatState;
  error?: string;
}
export const MODELS = [
  { id: 'google-ai-studio/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'google-ai-studio/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'google-ai-studio/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
];
const SESSION_STORAGE_KEY = 'veridia_active_session';
class ChatService {
  private sessionId: string;
  private baseUrl: string;
  constructor() {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    this.sessionId = saved || crypto.randomUUID();
    if (!saved) localStorage.setItem(SESSION_STORAGE_KEY, this.sessionId);
    this.baseUrl = `/api/chat/${this.sessionId}`;
  }
  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status >= 500 && i < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, i) * 250));
          continue;
        }
        return res;
      } catch (e) {
        lastError = e;
        if (i < retries - 1) await new Promise(r => setTimeout(r, Math.pow(2, i) * 250));
      }
    }
    throw lastError || new Error('Request failed after retries');
  }
  private async recoverOnRouteError(): Promise<boolean> {
    try {
      const res = await this.createSession();
      if (res.success && res.data) {
        this.switchSession(res.data.sessionId);
        return true;
      }
    } catch (_) { /* intentional no-op */ }
    return false;
  }
  async sendMessage(
    message: string,
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<ChatResponse> {
    try {
      let response = await this.fetchWithRetry(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, stream: !!onChunk }),
      });
      if (response.status === 500) {
        const body = await response.clone().json().catch(() => ({}));
        if (body?.error?.includes('Worker routes')) {
          const recovered = await this.recoverOnRouteError();
          if (recovered) {
            response = await this.fetchWithRetry(`${this.baseUrl}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, model, stream: !!onChunk }),
            });
          }
        }
      }
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`[ChatService] HTTP Error: ${response.status} ${errorBody}`);
        throw new Error(`HTTP ${response.status}`);
      }
      if (onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) onChunk(chunk);
          }
        } finally {
          reader.releaseLock();
        }
        return {
          success: true,
          data: { messages: [], sessionId: this.sessionId, isProcessing: false, model: MODELS[0].id }
        };
      }
      return await response.json();
    } catch (error) {
      console.error('[ChatService] Send failed:', error);
      return { success: false, error: 'Network communication failure' };
    }
  }
  async getMessages(): Promise<ChatResponse> {
    try {
      let response = await this.fetchWithRetry(`${this.baseUrl}/messages`);
      if (response.status === 500) {
        const body = await response.clone().json().catch(() => ({}));
        if (body?.error?.includes('Worker routes')) {
          const recovered = await this.recoverOnRouteError();
          if (recovered) {
            response = await this.fetchWithRetry(`${this.baseUrl}/messages`);
          }
        }
      }
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`[ChatService] Fetch messages failed: ${response.status} ${errorBody}`);
        if (response.status === 404) {
          await this.createSession();
          const retryResponse = await this.fetchWithRetry(`${this.baseUrl}/messages`);
          if (retryResponse.ok) {
            return await retryResponse.json();
          }
        }
        return {
          success: true,
          data: { messages: [], sessionId: this.sessionId, isProcessing: false, model: MODELS[0].id }
        };
      }
      return await response.json();
    } catch (error) {
      console.error('[ChatService] Fetch messages failed:', error);
      return {
        success: true,
        data: { messages: [], sessionId: this.sessionId, isProcessing: false, model: MODELS[0].id }
      };
    }
  }
  async clearMessages(): Promise<ChatResponse> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/clear`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Clear command failed' };
    }
  }
  getSessionId(): string {
    return this.sessionId;
  }
  switchSession(sessionId: string): void {
    this.sessionId = sessionId;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    this.baseUrl = `/api/chat/${sessionId}`;
  }
  async createSession(
    title?: string,
    sessionId?: string,
    firstMessage?: string
  ): Promise<{ success: boolean; data?: { sessionId: string; title: string }; error?: string }> {
    try {
      const response = await this.fetchWithRetry('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sessionId, firstMessage })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Session creation failed' };
    }
  }
  async listSessions(): Promise<{ success: boolean; data?: SessionInfo[]; error?: string }> {
    try {
      const response = await this.fetchWithRetry('/api/sessions');
      return await response.json();
    } catch (error) {
      return { success: false, error: 'List retrieval failed' };
    }
  }
  async saveToMemory(content: string): Promise<ChatResponse> {
    try {
      const preview = content.split('.')[0].slice(0, 40) + '...';
      const res = await this.createSession(`Memory: ${preview}`, undefined, content);
      if (res.success && res.data) {
        return {
          success: true,
          data: {
            messages: [],
            sessionId: res.data.sessionId,
            isProcessing: false,
            model: MODELS[0].id
          }
        };
      }
      return { success: false, error: res.error };
    } catch (error) {
      return { success: false, error: 'Memory storage failure' };
    }
  }
}
export const chatService = new ChatService();
export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
export const renderToolCall = (toolCall: ToolCall): string => {
  const result = toolCall.result as WeatherResult | MCPResult | ErrorResult | undefined;
  const name = toolCall.name;
  const friendlyName =
    name === 'web_search'
      ? 'Clinical Search'
      : name === 'get_weather'
      ? 'Environment'
      : name.replace(/_/g, ' ');
  if (!result) return `⌛ ${friendlyName}`;
  if ('error' in result) return `⚠️ ${friendlyName} Error`;
  return `✅ ${friendlyName}`;
};