// 임시 통합 테스트 스크립트. 브라우저 로그인 없이 새 Agent Runtime 전체 흐름을 검증한다.
// 실행: node --env-file=.env.local -r tsx/cjs scripts/test-orchestrator.ts
import { db } from "../src/lib/db";
import { runOrchestrator } from "../src/lib/orchestrator";

async function main() {
  const email = process.env.ALLOWED_EMAILS?.split(",")[0]?.trim() ?? "test@example.com";

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Test User" },
  });

  console.log("=== TEST A: 단일 팀 라우팅 (CS 예상) — LLM 기반 Orchestrator ===");
  const convA = await db.conversation.create({
    data: { userId: user.id, title: "TEST A: 혜택 지급시점 문의" },
  });
  const resultA = await runOrchestrator({
    userId: user.id,
    conversationId: convA.id,
    userRequest: "고객들이 혜택 지급시점을 자꾸 물어봐요. 어떻게 안내해야 할까요?",
  });
  console.log("agentsInvolved:", resultA.agentsInvolved);
  console.log("error:", resultA.error);
  console.log("finalConclusion (앞 400자):\n", resultA.finalConclusion.slice(0, 400));

  console.log("\n=== TEST B: 다중 팀 교차검토 (Strategy + Product, Anthropic tool loop 검증) ===");
  const convB = await db.conversation.create({
    data: { userId: user.id, title: "TEST B: 계약관리 서비스 구현" },
  });
  const resultB = await runOrchestrator({
    userId: user.id,
    conversationId: convB.id,
    userRequest:
      "고객이 본인 계약을 한눈에 점검할 수 있는 계약관리 서비스를 사이트에 만들려고 해. 사업적 타당성과 구현 난이도를 함께 검토해줘.",
  });
  console.log("agentsInvolved:", resultB.agentsInvolved);
  console.log("error:", resultB.error);
  console.log("opinions keys:", Object.keys(resultB.opinions));
  console.log("finalConclusion (앞 500자):\n", resultB.finalConclusion.slice(0, 500));

  const taskIds = [resultA.taskId, resultB.taskId];
  const runs = await db.agentRun.findMany({
    where: { taskId: { in: taskIds } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n=== AgentRun 로그 (Cost Control 필드 확인) ===");
  for (const r of runs) {
    console.log(
      `${r.agent} | ${r.provider} | ${r.model} | ${r.status} | steps=${r.steps} | in=${r.inputTokens} out=${r.outputTokens} | $${r.estimatedCostUsd?.toFixed(5)} | ${r.latencyMs}ms`
    );
  }

  const handoffs = await db.handoff.findMany({ where: { taskId: { in: taskIds } } });
  console.log("\n=== 생성된 Handoff 수:", handoffs.length, "===");
  for (const h of handoffs) {
    console.log(JSON.stringify(h.content, null, 2).slice(0, 500));
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("TEST FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
