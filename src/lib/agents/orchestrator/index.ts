import { runAgentCore, type AgentCoreResult } from "@/lib/agent-runtime/run-agent";
import { RoutingPlanSchema, type RoutingPlan } from "@/lib/agent-runtime/schemas";
import { ROUTING_PLAN_JSON_SCHEMA } from "@/lib/agent-runtime/json-schemas";
import { ORCHESTRATOR_CONFIG } from "./config";

export interface OrchestratorRunInput {
  taskId: string;
  userId: string;
  userRequest: string;
  masterSummary: string;
  relatedDocsSummary: string;
}

// AGENT 1 — SOMUN ORCHESTRATOR
// 사용자 요청을 이해하고, 어떤 전문 팀이 실제로 필요한지만 판단한다.
// 이 판단 자체도 tool 호출이 가능한 진짜 Agent 실행이다 (get_master/search_drive 등).
export async function runOrchestratorRouting(
  input: OrchestratorRunInput
): Promise<AgentCoreResult<RoutingPlan>> {
  const userPrompt = `
[최신 MASTER 요약]
${input.masterSummary || "(없음 — 필요하면 get_master tool로 확인)"}

[사전 검색된 관련 Drive 자료 목록]
${input.relatedDocsSummary || "(없음)"}

[사용자 요청]
${input.userRequest}
`.trim();

  return runAgentCore<RoutingPlan>({
    agentName: "orchestrator",
    taskId: input.taskId,
    userId: input.userId,
    systemPrompt: `${ORCHESTRATOR_CONFIG.systemRole}\n\n[의사결정 규칙]\n${ORCHESTRATOR_CONFIG.decisionRules
      .map((r) => `- ${r}`)
      .join("\n")}`,
    userPrompt,
    allowedTools: ORCHESTRATOR_CONFIG.allowedTools,
    maxSteps: ORCHESTRATOR_CONFIG.maxSteps,
    costBudgetUsd: ORCHESTRATOR_CONFIG.costBudgetUsd,
    submitToolName: "submit_routing_plan",
    submitToolDescription: "라우팅 판단 결과를 제출합니다. 판단이 끝났으면 반드시 호출하세요.",
    submitToolSchema: ROUTING_PLAN_JSON_SCHEMA,
    outputSchema: RoutingPlanSchema,
    buildFallback: () => ({
      reasoning: "라우팅 판단에 실패해 기본값(Strategy 단독)으로 대체했습니다.",
      agents: ["strategy"],
      cross_review_needed: false,
    }),
  });
}
