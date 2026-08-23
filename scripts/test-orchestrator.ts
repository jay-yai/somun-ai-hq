// 임시 통합 테스트 스크립트. 브라우저 로그인 없이 Orchestrator 전체 흐름을 검증한다.
// 실행: node --env-file=.env.local -r tsx/cjs scripts/test-orchestrator.ts (또는 npm run test:orchestrator)
import { db } from "../src/lib/db";
import { runOrchestrator } from "../src/lib/orchestrator";

async function main() {
  const email = process.env.ALLOWED_EMAILS?.split(",")[0]?.trim() ?? "test@example.com";

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Test User" },
  });

  const conversation = await db.conversation.create({
    data: { userId: user.id, title: "TEST 1: 브랜드 포지셔닝" },
  });

  console.log("=== TEST 1: 브랜드 포지셔닝 (Strategy 단독 예상) ===");
  const result = await runOrchestrator({
    userId: user.id,
    conversationId: conversation.id,
    userRequest: "소문다이렉트의 브랜드 포지셔닝을 검토해줘.",
  });

  console.log("agentsInvolved:", result.agentsInvolved);
  console.log("error:", result.error);
  console.log("finalConclusion (앞 500자):");
  console.log(result.finalConclusion.slice(0, 500));
  console.log("driveFileId 확인은 Task 레코드에서 별도 조회 필요");

  const task = await db.task.findUnique({ where: { id: result.taskId } });
  console.log("task.driveFileId:", task?.driveFileId);
  console.log("task.status:", task?.status);

  console.log("\n=== TEST 2: 다중 팀 교차검토 (Strategy + Growth 예상) ===");
  const conversation2 = await db.conversation.create({
    data: { userId: user.id, title: "TEST 2: 친구추천 마케팅+전략" },
  });
  const result2 = await runOrchestrator({
    userId: user.id,
    conversationId: conversation2.id,
    userRequest: "친구추천 서비스를 마케팅 관점과 전략 관점에서 같이 검토해줘.",
  });
  console.log("agentsInvolved:", result2.agentsInvolved);
  console.log("error:", result2.error);
  console.log("opinions keys:", Object.keys(result2.opinions));
  console.log("finalConclusion (앞 400자):");
  console.log(result2.finalConclusion.slice(0, 400));

  const runs = await db.agentRun.findMany({
    where: { taskId: { in: [result.taskId, result2.taskId] } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n=== AgentRun 로그 (비용 기록 확인) ===");
  for (const r of runs) {
    console.log(
      `${r.agent} | ${r.model} | ${r.status} | in=${r.inputTokens} out=${r.outputTokens} | $${r.estimatedCostUsd?.toFixed(5)}`
    );
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("TEST FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
