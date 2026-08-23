import type { AgentStepLog, ToolSpec } from "../types";

export interface ToolLoopParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolSpec[]; // KM tools + 마지막 하나는 항상 "필수 종료 tool" (submit_*)
  requiredFinalTool: string;
  maxSteps: number;
  maxOutputTokensPerStep?: number;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolLoopResult {
  // 모델이 requiredFinalTool을 호출했다면 그 인자, 아니면 null (fallback 필요)
  finalToolArgs: Record<string, unknown> | null;
  fallbackText: string;
  steps: AgentStepLog[];
}
