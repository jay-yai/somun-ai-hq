import { db } from "@/lib/db";

export interface AgentUsageRow {
  agent: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RecentRunRow {
  id: string;
  agent: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  createdAt: Date;
  taskTitle: string;
}

export interface UsageSummary {
  totalCostUsd: number;
  totalCalls: number;
  byAgent: AgentUsageRow[];
  recent: RecentRunRow[];
}

// 섹션 18: 호출한 Agent / 모델 / 토큰 / 예상 비용을 한눈에 볼 수 있게 집계한다.
// 본인 소유 대화에 속한 호출만 집계한다 (다른 사용자 비용 노출 방지).
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const runs = await db.agentRun.findMany({
    where: { task: { conversation: { userId } } },
    orderBy: { createdAt: "desc" },
    include: { task: { select: { title: true } } },
  });

  const totalCostUsd = runs.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);

  const byAgentMap = new Map<string, AgentUsageRow>();
  for (const r of runs) {
    const cur = byAgentMap.get(r.agent) ?? {
      agent: r.agent,
      calls: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    cur.calls += 1;
    cur.costUsd += r.estimatedCostUsd ?? 0;
    cur.inputTokens += r.inputTokens ?? 0;
    cur.outputTokens += r.outputTokens ?? 0;
    byAgentMap.set(r.agent, cur);
  }

  return {
    totalCostUsd,
    totalCalls: runs.length,
    byAgent: Array.from(byAgentMap.values()).sort((a, b) => b.costUsd - a.costUsd),
    recent: runs.slice(0, 30).map((r) => ({
      id: r.id,
      agent: r.agent,
      model: r.model,
      status: r.status,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      createdAt: r.createdAt,
      taskTitle: r.task?.title ?? "",
    })),
  };
}
