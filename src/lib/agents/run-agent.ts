import { db } from "@/lib/db";
import {
  getAgentProvider,
  resolveModel,
  type AgentName,
  type ModelTier,
} from "@/lib/ai/model-config";
import { callAnthropic, callOpenAI, callGemini } from "@/lib/ai/providers";
import { estimateCostUsd } from "@/lib/ai/pricing";
import type { AgentOutput } from "./types";

// 특정 팀(Agent) 한 번 호출 + 비용/토큰 기록 + 실패 시 DB에 실패 로그 남기고 예외를 던진다.
// 예외를 던지는 이유: Orchestrator가 Fail Fast 정책(섹션 19)을 적용해
// 이후 불필요한 다른 팀 호출을 막을 수 있도록 하기 위함이다.
export async function runAgent(
  agent: AgentName,
  taskId: string,
  systemPrompt: string,
  userPrompt: string,
  tier: ModelTier = "default"
): Promise<AgentOutput> {
  const model = resolveModel(agent, tier);
  const provider = getAgentProvider(agent);

  try {
    let result;
    switch (provider) {
      case "anthropic":
        result = await callAnthropic(model, systemPrompt, userPrompt);
        break;
      case "openai":
        result = await callOpenAI(model, systemPrompt, userPrompt);
        break;
      case "gemini":
        result = await callGemini(model, systemPrompt, userPrompt);
        break;
    }

    const estimatedCostUsd = estimateCostUsd(
      model,
      result.inputTokens,
      result.outputTokens
    );

    await db.agentRun.create({
      data: {
        taskId,
        agent,
        model,
        status: "success",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd,
      },
    });

    return {
      agent,
      model,
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.agentRun.create({
      data: {
        taskId,
        agent,
        model,
        status: "failed",
        errorMessage: message,
      },
    });
    throw new AgentCallError(agent, message);
  }
}

export class AgentCallError extends Error {
  agent: AgentName;
  constructor(agent: AgentName, message: string) {
    super(`[${agent}] 호출 실패: ${message}`);
    this.agent = agent;
  }
}
