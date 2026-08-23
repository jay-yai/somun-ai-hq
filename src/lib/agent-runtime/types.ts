// SOMUN AI HQ Agent Runtime — 공유 타입 정의.
// 이 파일은 "Agent = System Role + Tools + Memory + Schema + Budget" 구조의
// 뼈대를 이룬다. 실제 개별 Agent 설정은 src/lib/agents/*.config.ts에 있다.

import type { AgentName, ModelTier, Provider } from "@/lib/ai/model-config";

export type { AgentName, ModelTier, Provider };

// ---------- Tool ----------

// Provider마다 tool 호출 방식(OpenAI function calling / Anthropic tool_use /
// Gemini functionDeclarations)이 다르므로, 우리는 provider 중립적인
// JSON Schema 형태로 tool을 정의하고 provider-loop에서 각자의 포맷으로 변환한다.
export interface JsonSchemaProperty {
  type: "string" | "boolean" | "number" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolParamSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: ToolParamSchema;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

export type KnowledgeManagerToolName =
  | "get_master"
  | "search_drive"
  | "read_document"
  | "search_previous_work"
  | "search_voc";

// ---------- Agent 설정 (System Role + Tools + Schema + Budget) ----------

export interface SpecialistAgentConfig {
  name: Exclude<AgentName, "orchestrator">;
  displayNameKo: string;
  systemRole: string;
  decisionRules: string[];
  allowedTools: KnowledgeManagerToolName[];
  maxSteps: number;
  costBudgetUsd: number;
}

// ---------- Agent 실행 로그 (Cost Control) ----------

export interface AgentStepLog {
  step: number;
  type: "tool_call" | "final_answer";
  toolName?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AgentRunLog {
  agent: AgentName;
  model: string;
  provider: Provider;
  status: "success" | "failed" | "budget_exceeded" | "max_steps_exceeded";
  steps: AgentStepLog[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  errorMessage?: string;
}

// ---------- Error Handling ----------

export class AgentExecutionError extends Error {
  agent: AgentName;
  cause_?: unknown;
  constructor(agent: AgentName, message: string, cause?: unknown) {
    super(`[${agent}] ${message}`);
    this.agent = agent;
    this.cause_ = cause;
  }
}
