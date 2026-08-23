import { db } from "@/lib/db";
import type { TaskStatus, TaskVersion } from "@prisma/client";
import type { AgentName } from "@/lib/ai/model-config";
import { AgentExecutionError } from "@/lib/agent-runtime/types";
import type { AgentOutput, Handoff } from "@/lib/agent-runtime/schemas";
import { runSpecialistAgent, type SpecialistRunInput } from "@/lib/agents/shared/run-specialist";
import { runOrchestratorRouting } from "@/lib/agents/orchestrator";
import { STRATEGY_CONFIG } from "@/lib/agents/strategy/config";
import { PRODUCT_CONFIG } from "@/lib/agents/product/config";
import { GROWTH_CONFIG } from "@/lib/agents/growth/config";
import { CS_CONFIG } from "@/lib/agents/cs/config";
import {
  getMasterSummary,
  searchRelevantDocs,
  saveTaskResult,
  saveHandoff,
} from "@/lib/drive/knowledge-manager";

type SpecialistAgentName = Exclude<AgentName, "orchestrator">;

const AGENT_CONFIGS = {
  strategy: STRATEGY_CONFIG,
  product: PRODUCT_CONFIG,
  growth: GROWTH_CONFIG,
  cs: CS_CONFIG,
};

const AGENT_LABEL: Record<SpecialistAgentName, string> = {
  strategy: "Strategy",
  product: "Product",
  growth: "Growth",
  cs: "CS",
};

export interface OrchestratorResult {
  taskId: string;
  agentsInvolved: SpecialistAgentName[];
  opinions: Partial<Record<SpecialistAgentName, string>>;
  finalConclusion: string;
  status: string;
  error?: string;
}

// 최종 결론 텍스트에 승인/MASTER변경 마커를 붙인다 (APPROVAL GATE).
function formatFinal(output: AgentOutput): string {
  const markers = [
    output.approval_required ? "[사용자 승인 필요]" : "",
    output.master_change_proposed ? "[MASTER 변경 제안]" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return markers ? `${markers}\n\n${output.body}` : output.body;
}

function fillHandoff(
  taskId: string,
  fromAgent: SpecialistAgentName,
  partial: NonNullable<AgentOutput["handoff"]>
): Handoff {
  return {
    task_id: taskId,
    from_agent: fromAgent,
    to_agent: partial.to_agent,
    objective: partial.objective,
    background: partial.background,
    relevant_master_rules: partial.relevant_master_rules,
    verified_facts: partial.verified_facts,
    assumptions: partial.assumptions,
    questions: partial.questions,
    risks: partial.risks,
    required_output: partial.required_output,
    priority: partial.priority,
  };
}

// 업무를 이어서 할 때(수정요청 등)는 재분류 비용을 쓰지 않고,
// 직전 버전에 참여했던 팀을 그대로 재사용한다.
function inferAgentsFromVersion(latest?: {
  strategyOpinion: string | null;
  productOpinion: string | null;
  growthOpinion: string | null;
  csOpinion: string | null;
}): SpecialistAgentName[] {
  if (!latest) return ["strategy"];
  const agents: SpecialistAgentName[] = [];
  if (latest.strategyOpinion) agents.push("strategy");
  if (latest.productOpinion) agents.push("product");
  if (latest.growthOpinion) agents.push("growth");
  if (latest.csOpinion) agents.push("cs");
  return agents.length > 0 ? agents : ["strategy"];
}

function formatTaskDocument(params: {
  title: string;
  userRequest: string;
  agentsInvolved: SpecialistAgentName[];
  masterSummary: string;
  opinions: Partial<Record<SpecialistAgentName, string>>;
  finalConclusion: string;
  status: string;
}): string {
  const opinionsText = (Object.keys(params.opinions) as SpecialistAgentName[])
    .map((k) => `### ${AGENT_LABEL[k]} 의견\n${params.opinions[k]}`)
    .join("\n\n");

  return `# ${params.title}

생성일: ${new Date().toISOString()}
참여 AI팀: ${params.agentsInvolved.join(", ")}
상태: ${params.status}

## 사용자 요청
${params.userRequest}

## 참고한 MASTER 요약
${params.masterSummary || "(MASTER 미확인)"}

## 팀별 의견
${opinionsText}

## 최종 결론
${params.finalConclusion}
`;
}

export async function runOrchestrator(params: {
  userId: string;
  conversationId: string;
  userRequest: string;
  taskId?: string;
  revisionNote?: string;
}): Promise<OrchestratorResult> {
  const { userId, conversationId, userRequest } = params;

  let task: Awaited<ReturnType<typeof db.task.create>>;
  let latestVersion: TaskVersion | undefined;

  if (params.taskId) {
    const found = await db.task.findUniqueOrThrow({
      where: { id: params.taskId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    task = found;
    latestVersion = found.versions[0];
  } else {
    task = await db.task.create({
      data: { conversationId, title: userRequest.slice(0, 80), status: "IDEA" },
    });
  }

  // Knowledge Manager 사전 조회 — 모든 Agent가 공유할 baseline context.
  // (Agent들은 이 외에도 필요하면 tool로 직접 더 조회할 수 있다.)
  const [masterSummary, relatedDocs] = await Promise.all([
    getMasterSummary(),
    searchRelevantDocs(userRequest),
  ]);

  let agentsInvolved: SpecialistAgentName[];
  let crossReviewNeeded: boolean;

  if (params.taskId) {
    agentsInvolved = inferAgentsFromVersion(latestVersion);
    crossReviewNeeded = agentsInvolved.length > 1;
  } else {
    try {
      const { output: routing } = await runOrchestratorRouting({
        taskId: task.id,
        userId,
        userRequest,
        masterSummary,
        relatedDocsSummary: relatedDocs.map((d) => `- ${d.path}`).join("\n"),
      });
      agentsInvolved = routing.agents;
      crossReviewNeeded = routing.cross_review_needed && agentsInvolved.length > 1;
    } catch (err) {
      if (err instanceof AgentExecutionError) {
        return {
          taskId: task.id,
          agentsInvolved: [],
          opinions: {},
          finalConclusion: "",
          status: task.status,
          error: err.message,
        };
      }
      throw err;
    }
  }

  const opinions: Partial<Record<SpecialistAgentName, string>> = {};
  const handoffsToSave: Handoff[] = [];
  let finalConclusion = "";

  const baseInput: Omit<SpecialistRunInput, "extraInstruction" | "tier"> = {
    taskId: task.id,
    userId,
    userRequest,
    masterSummary,
    relatedDocs,
  };

  try {
    if (!crossReviewNeeded) {
      const agent = agentsInvolved[0];
      const { output } = await runSpecialistAgent(AGENT_CONFIGS[agent], {
        ...baseInput,
        extraInstruction: params.revisionNote,
      });
      opinions[agent] = output.body;
      finalConclusion = formatFinal(output);
      if (output.handoff) handoffsToSave.push(fillHandoff(task.id, agent, output.handoff));
    } else {
      // 1차 분석: Strategy (Fail Fast — 여기서 실패하면 이후 팀을 호출하지 않는다)
      const { output: strategyFirst } = await runSpecialistAgent(STRATEGY_CONFIG, {
        ...baseInput,
        extraInstruction: `${params.revisionNote ?? ""}\n이 업무는 여러 팀 검토가 필요합니다. 1차 분석(문제 정의, 방향성)을 작성하세요.`.trim(),
      });
      opinions.strategy = strategyFirst.body;
      if (strategyFirst.handoff)
        handoffsToSave.push(fillHandoff(task.id, "strategy", strategyFirst.handoff));

      // 전문팀 교차검토 (병렬, 서로 자동 동의하지 않음) — 실패한 팀은 조용히 제외
      const secondaryAgents = agentsInvolved.filter((a) => a !== "strategy");
      const secondaryResults = await Promise.allSettled(
        secondaryAgents.map((agent) =>
          runSpecialistAgent(AGENT_CONFIGS[agent], {
            ...baseInput,
            extraInstruction: `Strategy 1차 분석:\n${strategyFirst.body}\n\n위 분석을 당신의 관점에서 검토하고, 동의하지 않는 부분이 있으면 명시하세요.`,
          })
        )
      );
      secondaryResults.forEach((res, i) => {
        const agent = secondaryAgents[i];
        if (res.status === "fulfilled") {
          opinions[agent] = res.value.output.body;
          if (res.value.output.handoff)
            handoffsToSave.push(fillHandoff(task.id, agent, res.value.output.handoff));
        }
      });

      // Strategy 최종 종합 — 중요 의사결정이므로 고성능 모델(tier: high)을 사용한다.
      const opinionsBlock = (Object.keys(opinions) as SpecialistAgentName[])
        .map((a) => `--- ${AGENT_LABEL[a]} 의견 ---\n${opinions[a]}`)
        .join("\n\n");
      const { output: finalOut } = await runSpecialistAgent(STRATEGY_CONFIG, {
        ...baseInput,
        tier: "high",
        extraInstruction: `[각 팀의 검토 의견]
${opinionsBlock}

위 내용을 종합하여 최종 결론을 아래 형식으로 작성하세요. 다수결이 아니라 MASTER와 사업목표를
기준으로 최종 판단하세요. 다른 팀 의견에 자동으로 동의하지 말고, 동의하지 않는 부분은 명시하세요.

1. 한 줄 결론
2. 현재 문제
3. 근거 / 시장상황
4. 핵심 인사이트
5. 전략 제안
6. 실행방법
7. 예상효과
8. 리스크 / 반론
9. 다음 Action
10. 사용자 결정 필요사항
11. 현재 상태 (IDEA/RESEARCH/TEST/APPROVED/BUILD/LIVE/HOLD/DROP 중 제안)`,
      });
      finalConclusion = formatFinal(finalOut);
      if (finalOut.handoff) handoffsToSave.push(fillHandoff(task.id, "strategy", finalOut.handoff));
    }
  } catch (err) {
    if (err instanceof AgentExecutionError) {
      return {
        taskId: task.id,
        agentsInvolved,
        opinions,
        finalConclusion: "",
        status: task.status,
        error: err.message,
      };
    }
    throw err;
  }

  for (const handoff of handoffsToSave) {
    await saveHandoff(task.id, handoff);
  }

  const nextVersion = task.currentVersion + (params.taskId ? 1 : 0);
  await db.taskVersion.create({
    data: {
      taskId: task.id,
      version: nextVersion,
      userRequest,
      strategyOpinion: opinions.strategy,
      productOpinion: opinions.product,
      growthOpinion: opinions.growth,
      csOpinion: opinions.cs,
      finalConclusion,
    },
  });

  const driveFileId = await saveTaskResult({
    existingFileId: task.driveFileId,
    title: task.title,
    status: task.status,
    content: formatTaskDocument({
      title: task.title,
      userRequest,
      agentsInvolved,
      masterSummary,
      opinions,
      finalConclusion,
      status: task.status,
    }),
  });

  await db.task.update({
    where: { id: task.id },
    data: {
      currentVersion: nextVersion,
      driveFileId: driveFileId ?? task.driveFileId,
      masterVersionRef: masterSummary ? new Date().toISOString() : task.masterVersionRef,
    },
  });

  return {
    taskId: task.id,
    agentsInvolved,
    opinions,
    finalConclusion,
    status: task.status,
  };
}

// 승인/보류 등 상태 변경 시, 최신 버전 내용으로 Drive 문서를 다시 저장하고
// 상태에 맞는 07_AI_WORK 하위 폴더로 이동시킨다 (섹션 24).
export async function resaveTaskWithStatus(taskId: string, status: TaskStatus): Promise<void> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const latest = task.versions[0];
  if (!latest) return;

  const opinions: Partial<Record<SpecialistAgentName, string>> = {};
  if (latest.strategyOpinion) opinions.strategy = latest.strategyOpinion;
  if (latest.productOpinion) opinions.product = latest.productOpinion;
  if (latest.growthOpinion) opinions.growth = latest.growthOpinion;
  if (latest.csOpinion) opinions.cs = latest.csOpinion;

  const driveFileId = await saveTaskResult({
    existingFileId: task.driveFileId,
    title: task.title,
    status,
    content: formatTaskDocument({
      title: task.title,
      userRequest: latest.userRequest,
      agentsInvolved: Object.keys(opinions) as SpecialistAgentName[],
      masterSummary: "",
      opinions,
      finalConclusion: latest.finalConclusion ?? "",
      status,
    }),
  });

  await db.task.update({
    where: { id: taskId },
    data: { status, driveFileId: driveFileId ?? task.driveFileId },
  });
}
