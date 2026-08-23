"use client";

import { useState } from "react";

const AGENT_LABELS: Record<string, string> = {
  strategy: "Strategy",
  product: "Product",
  growth: "Growth",
  cs: "CS",
};

export interface TaskResultData {
  taskId: string;
  agentsInvolved: string[];
  opinions: Record<string, string>;
  finalConclusion: string;
}

export function TaskResultCard({
  data,
  status,
  onDecision,
}: {
  data: TaskResultData;
  status?: string;
  onDecision: (
    taskId: string,
    decision: "APPROVED" | "HOLD" | "REVISION_REQUESTED",
    note?: string
  ) => Promise<void>;
}) {
  const [showOpinions, setShowOpinions] = useState(false);
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isApproved = status === "APPROVED";

  async function handle(decision: "APPROVED" | "HOLD" | "REVISION_REQUESTED") {
    if (decision === "REVISION_REQUESTED" && !revising) {
      setRevising(true);
      return;
    }
    setBusy(true);
    try {
      await onDecision(data.taskId, decision, note || undefined);
      setRevising(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-[#1496F4]">참여</span>
        <span>
          {data.agentsInvolved.map((a) => AGENT_LABELS[a] ?? a).join(" · ")}
        </span>
        {status && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
            {status}
          </span>
        )}
      </div>

      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
        {data.finalConclusion}
      </div>

      {Object.keys(data.opinions).length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowOpinions((v) => !v)}
            className="text-xs font-medium text-[#1496F4] hover:underline"
          >
            {showOpinions ? "팀별 검토내용 접기" : "팀별 검토내용 보기"}
          </button>
          {showOpinions && (
            <div className="mt-2 space-y-3 rounded-lg bg-gray-50 p-3">
              {Object.entries(data.opinions).map(([agent, text]) => (
                <div key={agent}>
                  <div className="mb-1 text-xs font-semibold text-gray-700">
                    {AGENT_LABELS[agent] ?? agent} 의견
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-gray-600">
                    {text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isApproved && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          {revising ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="수정하고 싶은 내용을 입력하세요"
                className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-[#1496F4] focus:outline-none"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  disabled={busy || note.trim().length === 0}
                  onClick={() => handle("REVISION_REQUESTED")}
                  className="rounded-lg bg-[#1496F4] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  수정의견 제출
                </button>
                <button
                  disabled={busy}
                  onClick={() => setRevising(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => handle("APPROVED")}
                className="rounded-lg bg-[#1496F4] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                승인
              </button>
              <button
                disabled={busy}
                onClick={() => handle("REVISION_REQUESTED")}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                수정 요청
              </button>
              <button
                disabled={busy}
                onClick={() => handle("HOLD")}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                보류
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
