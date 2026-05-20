import type { Message, ToolCall } from './types';
import { getToolDefinitions, executeTool } from './tools';
import { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs';
interface WorkersAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface WorkersAIResponse {
  result?: {
    response?: string;
  };
  errors?: any[];
}
interface WorkersAIStreamChunk {
  response?: string;
  p?: string;
}
export class ChatHandler {
  private accountApiKey: string;
  private model: string;
  private accountId: string;
  constructor(aiGatewayUrl: string, apiKey: string, model: string, accountId?: string) {
    this.accountApiKey = apiKey;
    this.model = model;
    this.accountId = accountId || this.extractAccountId(aiGatewayUrl);
  }
  private extractAccountId(baseUrl: string): string {
    const match = baseUrl.match(/accounts\/([^/]+)/);
    return match ? match[1] : '';
  }
  private mapToWorkersAIModel(modelId: string): string {
    const mappings: Record<string, string> = {
      'google-ai-studio/gemini-2.5-flash': '@cf/google/gemini-flash-2.5',
      'google-ai-studio/gemini-2.5-pro': '@cf/google/gemini-flash-2.5',
      'google-ai-studio/gemini-2.0-flash': '@cf/google/gemini-flash-2.0',
      'default': '@cf/meta/llama-3-8b-instruct'
    };
    return mappings[modelId] || mappings['default'];
  }
  async processMessage(
    message: string,
    history: Message[],
    onChunk?: (chunk: string) => void
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const messages = this.buildConversationMessages(message, history);
    const toolDefinitions = await getToolDefinitions();
    if (onChunk) {
      return this.handleStreamResponse(messages, toolDefinitions, message, history, onChunk);
    }
    return this.handleNonStreamResponse(messages, toolDefinitions, message, history);
  }
  private async callWorkersAI(
    messages: WorkersAIMessage[],
    stream = false,
    tools?: any[]
  ): Promise<Response> {
    const modelName = this.mapToWorkersAIModel(this.model);
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${modelName}`;
    const body: any = {
      messages,
      stream
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accountApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }
  private async handleStreamResponse(
    messages: WorkersAIMessage[],
    toolDefinitions: any[],
    message: string,
    history: Message[],
    onChunk: (chunk: string) => void
  ) {
    let fullContent = '';
    try {
      const response = await this.callWorkersAI(messages, true, toolDefinitions);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WorkersAI] Stream request failed:', response.status, errorText);
        onChunk('I encountered a temporary issue. Please try again.');
        return { content: 'I encountered a temporary issue. Please try again.' };
      }
      if (!response.body) {
        throw new Error('No response body');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data) as WorkersAIStreamChunk;
                const chunkText = parsed.response || parsed.p || '';
                if (chunkText) {
                  fullContent += chunkText;
                  onChunk(chunkText);
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      // Handle tool calls if needed (simplified for Workers AI)
      if (fullContent.includes('TOOL_CALL')) {
        const executed = await this.executeToolCallsFromText(fullContent);
        const final = await this.generateToolResponse(message, history, [], executed);
        return { content: final, toolCalls: executed };
      }
      return { content: fullContent };
    } catch (error) {
      console.error('[WorkersAI] Stream error:', error);
      onChunk('Sorry, I encountered an error. Please try again.');
      return { content: 'Sorry, I encountered an error. Please try again.' };
    }
  }
  private async handleNonStreamResponse(
    messages: WorkersAIMessage[],
    toolDefinitions: any[],
    message: string,
    history: Message[]
  ) {
    try {
      const response = await this.callWorkersAI(messages, false, toolDefinitions);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WorkersAI] Request failed:', response.status, errorText);
        return { content: 'I encountered a temporary issue. Please try again.' };
      }
      const result: WorkersAIResponse = await response.json();
      if (result.errors && result.errors.length > 0) {
        console.error('[WorkersAI] API errors:', result.errors);
        return { content: 'I encountered a temporary issue. Please try again.' };
      }
      const content = result.result?.response || '';
      if (content.includes('TOOL_CALL')) {
        const executed = await this.executeToolCallsFromText(content);
        const final = await this.generateToolResponse(message, history, [], executed);
        return { content: final, toolCalls: executed };
      }
      return { content };
    } catch (error) {
      console.error('[WorkersAI] Non-stream error:', error);
      return { content: 'Sorry, I encountered an error. Please try again.' };
    }
  }
  private async executeToolCallsFromText(text: string): Promise<ToolCall[]> {
    // Simplified tool call parsing from text response
    return [];
  }
  private async executeToolCalls(
    openAiToolCalls: ChatCompletionMessageFunctionToolCall[]
  ): Promise<ToolCall[]> {
    return Promise.all(
      openAiToolCalls.map(async (tc) => {
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          const result = await executeTool(tc.function.name, args);
          return { id: tc.id, name: tc.function.name, arguments: args, result };
        } catch (e) {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: {},
            result: { error: 'Clinical data retrieval failed' }
          };
        }
      })
    );
  }
  private async generateToolResponse(
    userMsg: string,
    history: Message[],
    toolCalls: any[],
    results: ToolCall[]
  ): Promise<string> {
    const followUpMessages = this.buildConversationMessages(userMsg, history);
    followUpMessages.push({
      role: 'assistant',
      content: `Tool results: ${JSON.stringify(results)}`
    });
    try {
      const response = await this.callWorkersAI(followUpMessages);
      if (!response.ok) {
        return 'Insight generated from available data.';
      }
      const result: WorkersAIResponse = await response.json();
      return result.result?.response || 'Insight generated from available data.';
    } catch (e) {
      return 'Insight generated from available data.';
    }
  }
  private buildConversationMessages(
    userMsg: string,
    history: Message[]
  ): WorkersAIMessage[] {
    return [
      {
        role: 'system',
        content: `You are Veridia, a professional and empathetic clinical health companion.
Instructions:
1. Provide evidence-based wellness guidance and educational insights.
2. NEVER diagnose; always refer to professionals for critical needs.
3. Use clinical Search tools for environment factors (pollen, weather) or wellness topics.
4. If symptoms indicate an emergency, strongly advise ER/911 immediately.
5. Tone: Calm, structured, minimalist, and deeply clinical.`
      },
      ...history.slice(-6).map(
        (m): WorkersAIMessage => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content
        })
      ),
      { role: 'user', content: userMsg }
    ];
  }
  updateModel(newModel: string): void {
    this.model = newModel;
  }
}