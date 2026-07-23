import { generateAI, type TaskType } from "../ai-provider";

export async function invokeLLM(params: {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
}): Promise<string> {
  const taskType: TaskType = params.taskType || "general";
  const result = await generateAI(taskType, params.messages, {
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
  return result.content;
}
