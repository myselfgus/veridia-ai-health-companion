import OpenAI from 'openai';
import type { Message, ToolCall } from './types';
import { getToolDefinitions, executeTool } from './tools';
import { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs';
export class ChatHandler {
  private client: OpenAI;
  private model: string;
  constructor(aiGatewayUrl: string, apiKey: string, model: string) {
    this.client = new OpenAI({ baseURL: aiGatewayUrl, apiKey: apiKey });
    this.model = model;
  }
  async processMessage(message: string, history: Message[], onChunk?: (chunk: string) => void): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const messages = this.buildConversationMessages(message, history);
    const toolDefinitions = await getToolDefinitions();
    if (onChunk) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        max_completion_tokens: 4000,
        stream: true
      });
      return this.handleStreamResponse(stream, message, history, onChunk);
    }
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto',
      max_tokens: 4000,
      stream: false
    });
    return this.handleNonStreamResponse(completion, message, history);
  }
  private async handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>, message: string, history: Message[], onChunk: (chunk: string) => void) {
    let fullContent = '';
    const accumulatedToolCalls: ChatCompletionMessageFunctionToolCall[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) { fullContent += delta.content; onChunk(delta.content); }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!accumulatedToolCalls[idx]) {
            accumulatedToolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } };
          } else {
            if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    }
    if (accumulatedToolCalls.length > 0) {
      const executed = await this.executeToolCalls(accumulatedToolCalls);
      const final = await this.generateToolResponse(message, history, accumulatedToolCalls, executed);
      return { content: final, toolCalls: executed };
    }
    return { content: fullContent };
  }
  private async handleNonStreamResponse(completion: OpenAI.Chat.Completions.ChatCompletion, message: string, history: Message[]) {
    const resMsg = completion.choices[0]?.message;
    if (!resMsg) return { content: 'I encountered an error. Please rephrase.' };
    if (!resMsg.tool_calls) return { content: resMsg.content || '' };
    const executed = await this.executeToolCalls(resMsg.tool_calls as ChatCompletionMessageFunctionToolCall[]);
    const final = await this.generateToolResponse(message, history, resMsg.tool_calls, executed);
    return { content: final, toolCalls: executed };
  }
  private async executeToolCalls(openAiToolCalls: ChatCompletionMessageFunctionToolCall[]): Promise<ToolCall[]> {
    return Promise.all(openAiToolCalls.map(async (tc) => {
      try {
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        const result = await executeTool(tc.function.name, args);
        return { id: tc.id, name: tc.function.name, arguments: args, result };
      } catch (e) {
        return { id: tc.id, name: tc.function.name, arguments: {}, result: { error: 'Clinical data retrieval failed' } };
      }
    }));
  }
  private async generateToolResponse(userMsg: string, history: Message[], toolCalls: any[], results: ToolCall[]): Promise<string> {
    const followUp = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are Veridia. Synthesize the clinical search results into an empathetic health narrative.' },
        ...history.slice(-3).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
        { role: 'assistant', content: null, tool_calls: toolCalls },
        ...results.map((r, i) => ({ role: 'tool' as const, content: JSON.stringify(r.result), tool_call_id: toolCalls[i]?.id || r.id }))
      ]
    });
    return followUp.choices[0]?.message?.content || 'Insight generated.';
  }
  private buildConversationMessages(userMsg: string, history: Message[]) {
    return [
      { role: 'system' as const, content: `You are Veridia, a professional and empathetic clinical health companion.
        Instructions:
        1. Provide evidence-based wellness guidance and educational insights.
        2. NEVER diagnose; always refer to professionals for critical needs.
        3. Use clinical Search tools for environment factors (pollen, weather) or wellness topics.
        4. If symptoms indicate an emergency, strongly advise ER/911 immediately.
        5. Tone: Calm, structured, minimalist, and deeply clinical.` },
      ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMsg }
    ];
  }
  updateModel(newModel: string): void { this.model = newModel; }
}