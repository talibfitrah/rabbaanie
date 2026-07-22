/**
 * AI Provider Abstraction Layer
 * 
 * Supports two providers:
 * 1. "builtin" - Uses the Manus Forge API (gemini-2.5-flash) - no extra config needed
 * 2. "openai" - Uses OpenAI API (gpt-4o-mini or gpt-4o) - requires OPENAI_API_KEY env var
 * 
 * To switch providers, set the AI_PROVIDER env var:
 * - AI_PROVIDER=builtin (default)
 * - AI_PROVIDER=openai
 * 
 * To set OpenAI model:
 * - AI_MODEL=gpt-4o-mini (default, cheaper)
 * - AI_MODEL=gpt-4o (better quality, more expensive)
 */

import { invokeLLM, type Message } from "./_core/llm";

// Types
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  provider: "builtin" | "openai";
  model: string;
  tokensUsed?: number;
}

export interface AIProviderConfig {
  provider: "builtin" | "openai";
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Get current provider configuration
function getProviderConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "builtin") as "builtin" | "openai";
  const model = process.env.AI_MODEL || (provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash");
  return { provider, model };
}

// Check if OpenAI is configured
function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Call OpenAI API directly
async function callOpenAI(messages: AIMessage[], config: AIProviderConfig): Promise<AIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Switch to builtin provider or set the key.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || "";
  const tokensUsed = data.usage?.total_tokens;

  return {
    content,
    provider: "openai",
    model: config.model || "gpt-4o-mini",
    tokensUsed,
  };
}

// Call built-in Manus Forge API
async function callBuiltin(messages: AIMessage[], config: AIProviderConfig): Promise<AIResponse> {
  const llmMessages: Message[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const result = await invokeLLM({ messages: llmMessages });
  const rawContent = result.choices[0]?.message?.content;
  const content = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c: any) => "text" in c ? c.text : "").join("")
      : "";

  return {
    content,
    provider: "builtin",
    model: "gemini-2.5-flash",
  };
}

/**
 * Main AI invocation function - automatically routes to the configured provider
 * 
 * Usage:
 * ```ts
 * const response = await invokeAI([
 *   { role: "system", content: "You are a parenting advisor..." },
 *   { role: "user", content: "How do I handle tantrums?" },
 * ]);
 * console.log(response.content);
 * ```
 */
export async function invokeAI(
  messages: AIMessage[],
  configOverride?: Partial<AIProviderConfig>
): Promise<AIResponse> {
  const baseConfig = getProviderConfig();
  const config: AIProviderConfig = { ...baseConfig, ...configOverride };

  // If OpenAI is requested but not configured, fall back to builtin
  if (config.provider === "openai" && !isOpenAIConfigured()) {
    console.warn("[AI Provider] OpenAI requested but OPENAI_API_KEY not set. Falling back to builtin.");
    config.provider = "builtin";
  }

  try {
    if (config.provider === "openai") {
      return await callOpenAI(messages, config);
    } else {
      return await callBuiltin(messages, config);
    }
  } catch (error) {
    // If primary provider fails and we have a fallback, try it
    if (config.provider === "openai") {
      console.warn("[AI Provider] OpenAI failed, falling back to builtin:", error);
      return await callBuiltin(messages, { ...config, provider: "builtin" });
    }
    throw error;
  }
}

/**
 * Invoke AI with conversation history (for chat-like interactions)
 * Automatically manages context window by trimming old messages if needed
 */
export async function invokeAIChat(
  systemPrompt: string,
  conversationHistory: AIMessage[],
  userMessage: string,
  configOverride?: Partial<AIProviderConfig>
): Promise<AIResponse> {
  // Build messages array with system prompt + history + new message
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-20), // Keep last 20 messages for context
    { role: "user", content: userMessage },
  ];

  return invokeAI(messages, configOverride);
}

/**
 * Get current provider status for admin dashboard
 */
export function getAIProviderStatus() {
  const config = getProviderConfig();
  return {
    activeProvider: config.provider,
    model: config.model,
    openaiConfigured: isOpenAIConfigured(),
    builtinAvailable: true,
  };
}
