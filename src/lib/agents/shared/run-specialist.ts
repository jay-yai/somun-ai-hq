import { runAgentCore, type AgentCoreResult } from "@/lib/agent-runtime/run-agent";
import { AgentOutputSchema, type AgentOutput, type Handoff } from "@/lib/agent-runtime/schemas";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/agent-runtime/json-schemas";
import type { SpecialistAgentConfig } from "@/lib/agent-runtime/types";
import type { DriveContextDoc } from "@/lib/drive/knowledge-manager";

export interface SpecialistRunInput {
  taskId: string;
  userId: string;
  userRequest: string;
  masterSummary: string;
  relatedDocs: DriveContextDoc[];
  previousConclusion?: string;
  handoffIn?: Handoff; // 다른 Agent로부터 받은 구조화 지시
  extraInstruction?: string; // 1차분석 지시, 수정요청, cross-review 맥락 등
  tier?: "default" | "high";
}

function buildUserPrompt(input: SpecialistRunInput): string {
  const docsBlock =
    input.relatedDocs.length > 0
      ? input.relatedDocs.map((d) => `--- [${d.path}] ---\n${d.content}`).join("\n\n")
      : "(미리 준비된 관련 자료 없음 — 필요하면 search_drive tool을 사용하세요)";

  const handoffBlock = input.handoffIn
    ? `
[다른 팀으로부터 받은 Handoff]
목표: ${input.handoffIn.objective}
배경: ${input.handoffIn.background}
요청 산출물: ${input.handoffIn.required_output}
${(input.handoffIn.risks?.length ?? 0) > 0 ? `우려사항: ${input.handoffIn.risks.join(", ")}` : ""}
`
    : "";

  return `
[최신 MASTER 요약]
${input.masterSummary || "(MASTER 문서를 아직 찾지 못했습니다. get_master tool로 다시 확인하거나 일반 원칙을 적용하세요.)"}

[미리 검색된 관련 Drive 자료]
${docsBlock}
${input.previousConclusion ? `\n[이전에 진행했던 관련 업무의 결론]\n${input.previousConclusion}\n` : ""}
${handoffBlock}
[사용자 요청]
${input.userRequest}

${input.extraInstruction ? `[추가 지시]\n${input.extraInstruction}` : ""}
`.trim();
}

export async function runSpecialistAgent(
  config: SpecialistAgentConfig,
  input: SpecialistRunInput
): Promise<AgentCoreResult<AgentOutput>> {
  const userPrompt = buildUserPrompt(input);
  return runAgentCore<AgentOutput>({
    agentName: config.name,
    taskId: input.taskId,
    userId: input.userId,
    tier: input.tier ?? "default",
    systemPrompt: `${config.systemRole}\n\n[의사결정 규칙]\n${config.decisionRules
      .map((r) => `- ${r}`)
      .join("\n")}`,
    userPrompt,
    allowedTools: config.allowedTools,
    maxSteps: config.maxSteps,
    costBudgetUsd: config.costBudgetUsd,
    submitToolName: "submit_final_answer",
    submitToolDescription:
      "최종 검토 결과를 제출합니다. 필요한 조사를 마쳤으면 반드시 이 tool을 호출하세요.",
    submitToolSchema: AGENT_OUTPUT_JSON_SCHEMA,
    outputSchema: AgentOutputSchema,
    buildFallback: (text) => ({
      summary: text.slice(0, 80),
      body: text,
      approval_required: false,
      master_change_proposed: false,
      risks: [],
    }),
  });
}
