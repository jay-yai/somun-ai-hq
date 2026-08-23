import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getUsageSummary } from "@/lib/usage";
import { AgentAvatar, AGENT_LABELS_KO } from "@/components/chat/AgentAvatar";

function fmtCost(n: number): string {
  return `$${n.toFixed(n < 0.01 ? 5 : 4)}`;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="p-8 text-sm text-gray-500">로그인이 필요합니다.</div>
    );
  }

  const usage = await getUsageSummary(user.id);

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
        >
          ← 채팅으로
        </Link>
        <div className="text-sm font-semibold text-gray-900">설정 · 비용 확인</div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-gray-500">누적 예상 비용</div>
            <div className="mt-1 text-2xl font-semibold text-[#1496F4]">
              {fmtCost(usage.totalCostUsd)}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-gray-500">총 AI 호출 수</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {usage.totalCalls}
            </div>
          </div>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            팀별 누적 비용
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2 font-medium">팀</th>
                  <th className="px-4 py-2 font-medium">호출 수</th>
                  <th className="px-4 py-2 font-medium">입력 토큰</th>
                  <th className="px-4 py-2 font-medium">출력 토큰</th>
                  <th className="px-4 py-2 text-right font-medium">비용</th>
                </tr>
              </thead>
              <tbody>
                {usage.byAgent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      아직 호출 기록이 없습니다.
                    </td>
                  </tr>
                )}
                {usage.byAgent.map((row) => (
                  <tr key={row.agent} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-gray-800">
                        <AgentAvatar agent={row.agent} size={20} />
                        {AGENT_LABELS_KO[row.agent] ?? row.agent}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{row.calls}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {row.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {row.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                      {fmtCost(row.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            최근 호출 로그 (최대 30건)
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2 font-medium">시각</th>
                  <th className="px-4 py-2 font-medium">업무</th>
                  <th className="px-4 py-2 font-medium">팀</th>
                  <th className="px-4 py-2 font-medium">모델</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 text-right font-medium">비용</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                      아직 호출 기록이 없습니다.
                    </td>
                  </tr>
                )}
                {usage.recent.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                      {fmtDate(r.createdAt)}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-700">
                      {r.taskTitle}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <AgentAvatar agent={r.agent} size={18} />
                        {AGENT_LABELS_KO[r.agent] ?? r.agent}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                      {r.model}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.status === "success"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {r.status === "success" ? "성공" : "실패"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {r.estimatedCostUsd != null ? fmtCost(r.estimatedCostUsd) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
