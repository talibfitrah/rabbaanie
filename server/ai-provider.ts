/**
 * Hybride AI Provider — OpenRouter (3 modellen)
 * 
 * Routing: Easy → Gemini Flash | Medium → Claude Sonnet 4 | Hard → Claude Opus 4.8
 * Fallback: Hard → Medium → Easy bij fouten
 */

export type TaskType =
  | "adhkar" | "search_knowledge"
  | "daily_advice" | "daily_goals" | "weekly_plan" | "spouse_advice" | "simple_chat"
  | "chat_complex" | "treatment_plan" | "fitrah_analysis" | "crisis_question" | "difficult_parenting"
  | "general";

type TaskDifficulty = "easy" | "medium" | "hard";

interface AIResponse {
  content: string;
  model: string;
  tokensUsed: { input: number; output: number };
}

function getTaskDifficulty(taskType: TaskType): TaskDifficulty {
  switch (taskType) {
    case "adhkar":
    case "search_knowledge":
      return "easy";
    case "daily_advice":
    case "daily_goals":
    case "weekly_plan":
    case "spouse_advice":
    case "simple_chat":
      return "medium";
    case "chat_complex":
    case "treatment_plan":
    case "fitrah_analysis":
    case "crisis_question":
    case "difficult_parenting":
      return "hard";
    default:
      return "medium";
  }
}

function getModelForDifficulty(difficulty: TaskDifficulty): string {
  const models = {
    easy: process.env.OPENROUTER_MODEL_EASY || "google/gemini-3.5-flash",
    medium: process.env.OPENROUTER_MODEL_MEDIUM || "anthropic/claude-sonnet-4",
    hard: process.env.OPENROUTER_MODEL_HARD || "anthropic/claude-opus-4.8",
  };
  return models[difficulty];
}

function getFallbackDifficulty(difficulty: TaskDifficulty): TaskDifficulty | null {
  switch (difficulty) {
    case "hard": return "medium";
    case "medium": return "easy";
    case "easy": return null;
  }
}

async function callOpenRouter(model: string, messages: any[], options?: { temperature?: number; maxTokens?: number }): Promise<AIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rabbaanie.com",
      "X-Title": "Rabbaanie",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || model,
    tokensUsed: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  };
}

export async function generateAI(
  taskType: TaskType,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<AIResponse> {
  const difficulty = getTaskDifficulty(taskType);
  let currentDifficulty: TaskDifficulty | null = difficulty;

  while (currentDifficulty) {
    const model = getModelForDifficulty(currentDifficulty);
    try {
      console.log(`[AI] Task: ${taskType} → ${currentDifficulty} → ${model}`);
      const result = await callOpenRouter(model, messages, options);
      console.log(`[AI] Success: ${model} (${result.tokensUsed.input}+${result.tokensUsed.output} tokens)`);
      return result;
    } catch (error: any) {
      console.error(`[AI] Error with ${model}:`, error.message);
      currentDifficulty = getFallbackDifficulty(currentDifficulty);
      if (!currentDifficulty) throw error;
      console.log(`[AI] Falling back to ${currentDifficulty}`);
    }
  }

  throw new Error("All AI models failed");
}

// Compatibility exports for ai-chat.ts
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
  provider: "openrouter";
  model: string;
  taskType?: TaskType;
  temperature?: number;
  maxTokens?: number;
}

export async function invokeAI(
  messages: AIMessage[],
  configOverride?: Partial<AIProviderConfig>
): Promise<AIResponse> {
  const taskType = configOverride?.taskType || "general";
  const result = await generateAI(taskType, messages, {
    temperature: configOverride?.temperature,
    maxTokens: configOverride?.maxTokens,
  });
  return {
    content: result.content,
    provider: "openrouter" as any,
    model: result.model,
    tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
  };
}

export async function invokeAIChat(
  systemPrompt: string,
  conversationHistory: AIMessage[],
  userMessage: string,
  configOverride?: Partial<AIProviderConfig>
): Promise<AIResponse> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];
  return invokeAI(messages, configOverride);
}

export function getAIProviderStatus() {
  return {
    activeProvider: "openrouter",
    model: process.env.OPENROUTER_MODEL_MEDIUM || "anthropic/claude-sonnet-4",
    openaiConfigured: false,
    builtinAvailable: true,
  };
}
