import { db } from "@/lib/db";
import type { TaskStatus } from "@prisma/client";
import type { AgentName } from "@/lib/ai/model-config";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildCrossReviewPrompt,
} from "@/lib/agents/prompts";
import { runAgent, AgentCallError } from "@/lib/agents/run-agent";
import type { OrchestratorContext } from "@/lib/agents/types";
import {
  getMasterSummary,
  searchRelevantDocs,
  saveTaskResult,
} from "@/lib/drive/knowledge-manager";
import { classifyAgents } from "./classify";

export interface OrchestratorResult {
  taskId: string;
  agentsInvolved: AgentName[];
  opinions: Partial<Record<AgentName, string>>;
  finalConclusion: string;
  status: string;
  error?: string;
}

// 사용자 이메일 기준으로, 제목이 비슷한 과거 업무의 최신 결론을 찾는다 (섹션 12).
// Google Drive가 아니라 DB를 기준으로 판단한다 (섹션 29: DB = 앱 동작 상태).
async function findPreviousConclusion(
  userId: string,
  userRequest: string
): Promise<string | undefined> {
  const keywords = userRequest
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  if (keywords.length === 0) return undefined;

  const candidates = await db.task.findMany({
    where: {
      conversation: { userId },
      OR: keywords.map((kw) => ({ title: { contains: kw } })),
    },
    orderBy: { updatedAt: "desc" },
    take: 1,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  return candidates[0]?.versions[0]?.finalConclusion ?? undefined;
}

export function formatTaskDocument(params: {
  title: string;
  userRequest: string;
  agentsInvolved: AgentName[];
  masterSummary: string;
  opinions: Partial<Record<AgentName, string>>;
  finalConclusion: string;
  status: string;
}): string {
  const labels: Record<AgentName, string> = {
    strategy: "Strategy 의견",
    product: "Product 의견",
    growth: "Growth 의견",
    cs: "CS 의견",
  };

  const opinionsText = (Object.keys(params.opinions) as AgentName[])
    .map((k) => `### ${labels[k]}\n${params.opinions[k]}`)
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
  taskId?: string; // 기존 업무를 이어서 할 경우
  revisionNote?: string; // 수정 요청 시 추가 의견
}): Promise<OrchestratorResult> {
  const { userId, conversationId, userRequest } = params;

  const agentsInvolved = classifyAgents(userRequest);

  const [masterSummary, relatedDocs, previousConclusion] = await Promise.all([
    getMasterSummary(),
    searchRelevantDocs(userRequest),
    params.taskId
      ? undefined
      : findPreviousConclusion(userId, userRequest),
  ]);

  const context: OrchestratorContext = {
    userRequest,
    masterSummary,
    relatedDocs,
    previousConclusion,
  };

  // 업무(Task) 레코드 준비: 새 업무 생성 또는 기존 업무에 새 버전 추가
  const task = params.taskId
    ? await db.task.findUniqueOrThrow({ where: { id: params.taskId } })
    : await db.task.create({
        data: {
          conversationId,
          title: userRequest.slice(0, 80),
          status: "IDEA",
        },
      });

  const opinions: Partial<Record<AgentName, string>> = {};
  let finalConclusion = "";

  try {
    if (agentsInvolved.length === 1) {
      // 단일 팀만 필요한 경우: 해당 팀 결과가 곧 최종 결과다.
      const agent = agentsInvolved[0];
      const output = await runAgent(
        agent,
        task.id,
        buildSystemPrompt(agent),
        buildUserPrompt(context, params.revisionNote)
      );
      opinions[agent] = output.text;
      finalConclusion = output.text;
    } else {
      // 1차 분석: Strategy (Fail Fast — 여기서 실패하면 이후 팀 호출을 하지 않는다)
      const strategyFirst = await runAgent(
        "strategy",
        task.id,
        buildSystemPrompt("strategy"),
        buildUserPrompt(
          context,
          `${params.revisionNote ?? ""}\n이 업무는 여러 팀 검토가 필요합니다. 1차 분석(문제 정의, 방향성)을 작성하세요.`
        )
      );
      opinions.strategy = strategyFirst.text;

      // 전문팀 검토 (병렬 실행, 서로 자동 동의하지 않음)
      const secondaryAgents = agentsInvolved.filter((a) => a !== "strategy");
      const secondaryResults = await Promise.allSettled(
        secondaryAgents.map((agent) =>
          runAgent(
            agent,
            task.id,
            buildSystemPrompt(agent),
            buildUserPrompt(
              context,
              `Strategy 1차 분석:\n${strategyFirst.text}\n\n위 분석을 당신의 관점에서 검토하고, 동의하지 않는 부분이 있으면 명시하세요.`
            )
          )
        )
      );

      secondaryResults.forEach((res, i) => {
        const agent = secondaryAgents[i];
        if (res.status === "fulfilled") {
          opinions[agent] = res.value.text;
        }
        // 실패한 팀은 조용히 제외하고, 최종 종합 단계에서 있는 의견만 사용한다.
      });

      // Strategy 최종 종합 — 중요 의사결정이므로 고성능 모델(tier: high)을 사용한다.
      const finalOutput = await runAgent(
        "strategy",
        task.id,
        buildSystemPrompt("strategy"),
        buildCrossReviewPrompt(context, opinions),
        "high"
      );
      finalConclusion = finalOutput.text;
    }
  } catch (err) {
    if (err instanceof AgentCallError) {
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

  // 버전 기록 (섹션 25: 기존 결과를 덮어쓰지 않고 새 버전 추가)
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
export async function resaveTaskWithStatus(
  taskId: string,
  status: TaskStatus
): Promise<void> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const latest = task.versions[0];
  if (!latest) return;

  const opinions: Partial<Record<AgentName, string>> = {};
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
      agentsInvolved: Object.keys(opinions) as AgentName[],
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
