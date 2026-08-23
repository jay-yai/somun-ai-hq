import { z } from "zod";
import { db } from "@/lib/db";
import { resolveModel, getAgentProvider, type AgentName, type ModelTier } from "@/lib/ai/model-config";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { runToolLoop } from "./provider-loop";
import { buildToolset, type KnowledgeManagerToolName } from "./tools";
import type { ToolParamSchema, ToolSpec, AgentStepLog, AgentRunLog } from "./types";
import { AgentExecutionError } from "./types";

export interface AgentCoreParams<T> {
  agentName: AgentName; // DB agent 필드 값 (orchestrator 포함)
  taskId: string;
  userId: string;
  tier?: ModelTier;
  systemPrompt: string;
  userPrompt: string;
  allowedTools: KnowledgeManagerToolName[];
  maxSteps: number;
  costBudgetUsd: number;
  submitToolName: string;
  submitToolDescription: string;
  submitToolSchema: ToolParamSchema;
  outputSchema: z.ZodType<T>;
  buildFallback: (fallbackText: string) => T; // submit tool을 호출하지 않고 텍스트로 끝났을 때 사용
}

export interface AgentCoreResult<T> {
  output: T;
  log: AgentRunLog;
}

// 재귀적으로 null -> undefined 로 바꾼다 (LLM이 "선택 필드 없음"을 null로 표현하는 경우 대응).
function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

// ==================================================
// 모든 Agent(Orchestrator 포함)가 공유하는 실행 엔진.
// System Role + Tools + Schema + Budget + Error Handling을 여기서 일괄 강제한다.
// ==================================================
export async function runAgentCore<T>(params: AgentCoreParams<T>): Promise<AgentCoreResult<T>> {
  const model = resolveModel(params.agentName === "orchestrator" ? "orchestrator" : params.agentName, params.tier);
  const provider = getAgentProvider(params.agentName === "orchestrator" ? "orchestrator" : params.agentName);

  const { specs, executors } = buildToolset(params.allowedTools, { userId: params.userId });

  const submitTool: ToolSpec = {
    name: params.submitToolName,
    description: params.submitToolDescription,
    parameters: params.submitToolSchema,
  };

  const systemPromptWithInstruction = `${params.systemPrompt}

[중요 실행 규칙]
- 필요하면 제공된 tool을 사용해 회사 자료(Google Drive)나 과거 업무를 직접 조회할 수 있다.
- 반드시 "${params.submitToolName}" tool을 호출하는 것으로 작업을 마쳐야 한다. 일반 텍스트로만 답하고 끝내지 마라.`;

  let loopResult;
  try {
    loopResult = await runToolLoop(provider, {
      model,
      systemPrompt: systemPromptWithInstruction,
      userPrompt: params.userPrompt,
      tools: [...specs, submitTool],
      requiredFinalTool: params.submitToolName,
      maxSteps: params.maxSteps,
      executeTool: async (name, args) => {
        const fn = executors[name];
        if (!fn) return { error: `알 수 없는 tool: ${name}` };
        return fn(args);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.agentRun.create({
      data: {
        taskId: params.taskId,
        agent: params.agentName,
        provider,
        model,
        status: "failed",
        errorMessage: message,
      },
    });
    throw new AgentExecutionError(params.agentName, `호출 실패: ${message}`, err);
  }

  const steps: AgentStepLog[] = loopResult.steps;
  const totalInputTokens = steps.reduce((s, x) => s + x.inputTokens, 0);
  const totalOutputTokens = steps.reduce((s, x) => s + x.outputTokens, 0);
  const totalLatencyMs = steps.reduce((s, x) => s + x.latencyMs, 0);
  const totalCostUsd = estimateCostUsd(model, totalInputTokens, totalOutputTokens);

  let output: T;
  let status: AgentRunLog["status"] = "success";

  if (loopResult.finalToolArgs) {
    // LLM이 선택적 필드를 생략하는 대신 null로 채워 보내는 경우가 흔하다.
    // zod의 .optional()은 undefined만 허용하므로, 검증 전에 null -> undefined로 정리한다.
    const sanitized = stripNulls(loopResult.finalToolArgs);
    const parsed = params.outputSchema.safeParse(sanitized);
    if (parsed.success) {
      output = parsed.data;
    } else {
      console.error(
        `[agent-runtime] ${params.agentName} output schema validation failed:`,
        parsed.error.message
      );
      // 스키마 검증 실패 — tool 인자를 최대한 살려 fallback 구성 (완전 실패시키지 않는다)
      output = params.buildFallback(JSON.stringify(loopResult.finalToolArgs));
    }
  } else {
    // submit tool을 호출하지 않고 끝남
    output = params.buildFallback(loopResult.fallbackText || "(응답 없음)");
    status = steps.length >= params.maxSteps ? "max_steps_exceeded" : "success";
  }

  if (totalCostUsd > params.costBudgetUsd) {
    status = status === "success" ? "budget_exceeded" : status;
  }

  const log: AgentRunLog = {
    agent: params.agentName,
    model,
    provider,
    status,
    steps,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    totalLatencyMs,
  };

  await db.agentRun.create({
    data: {
      taskId: params.taskId,
      agent: params.agentName,
      provider,
      model,
      status,
      steps: steps.length,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd: totalCostUsd,
      latencyMs: totalLatencyMs,
      stepsLog: steps as unknown as object,
    },
  });

  return { output, log };
}
