"use client";

import { useEffect, useRef, useState } from "react";
import { TaskResultCard, type TaskResultData } from "./TaskResultCard";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface TaskSummary {
  id: string;
  status: string;
}

function parseAssistantContent(
  content: string
): { kind: "task"; data: TaskResultData } | { kind: "text"; text: string } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.finalConclusion === "string") {
      return { kind: "task", data: parsed as TaskResultData };
    }
  } catch {
    // JSON이 아니면 일반 텍스트
  }
  return { kind: "text", text: content };
}

export function ChatApp({ userName }: { userName: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskStatus, setTaskStatus] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations(q?: string) {
    const res = await fetch(
      `/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`
    );
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }

  async function loadConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    if (!data.conversation) return;
    setMessages(data.conversation.messages);
    const statusMap: Record<string, string> = {};
    for (const t of data.conversation.tasks as TaskSummary[]) {
      statusMap[t.id] = t.status;
    }
    setTaskStatus(statusMap);
    setActiveId(id);
    setSidebarOpen(false);
  }

  useEffect(() => {
    // 최초 마운트 시 대화 목록을 서버에서 가져온다 (외부 시스템과의 동기화).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setTaskStatus({});
    setSidebarOpen(false);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          message: text,
        }),
      });
      const data = await res.json();

      if (!activeId && data.conversationId) {
        setActiveId(data.conversationId);
        loadConversations();
      }

      if (data.taskId) {
        setTaskStatus((prev) => ({ ...prev, [data.taskId]: data.status ?? "IDEA" }));
      }

      const assistantMessage: ChatMessage = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: data.error
          ? `⚠️ ${data.error}`
          : JSON.stringify({
              taskId: data.taskId,
              agentsInvolved: data.agentsInvolved,
              opinions: data.opinions,
              finalConclusion: data.finalConclusion,
            }),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: "⚠️ 네트워크 오류가 발생했습니다. 다시 시도해주세요.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleDecision(
    taskId: string,
    decision: "APPROVED" | "HOLD" | "REVISION_REQUESTED",
    note?: string
  ) {
    const res = await fetch(`/api/tasks/${taskId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    const data = await res.json();

    if (decision === "REVISION_REQUESTED" && data.finalConclusion) {
      const assistantMessage: ChatMessage = {
        id: `local-revision-${Date.now()}`,
        role: "assistant",
        content: JSON.stringify({
          taskId: data.taskId,
          agentsInvolved: data.agentsInvolved,
          opinions: data.opinions,
          finalConclusion: data.finalConclusion,
        }),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setTaskStatus((prev) => ({ ...prev, [taskId]: data.status ?? prev[taskId] }));
    } else if (data.status) {
      setTaskStatus((prev) => ({ ...prev, [taskId]: data.status }));
    }
  }

  return (
    <div className="flex h-dvh bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 transform border-r border-gray-200 bg-white transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col p-3">
          <button
            onClick={startNewChat}
            className="mb-3 rounded-lg bg-[#1496F4] px-3 py-2 text-sm font-medium text-white"
          >
            + 새 대화
          </button>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              loadConversations(e.target.value);
            }}
            placeholder="대화 검색"
            className="mb-3 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1496F4] focus:outline-none"
          />
          <div className="flex-1 space-y-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                  activeId === c.id
                    ? "bg-blue-50 text-[#1496F4]"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
            aria-label="메뉴 열기"
          >
            ☰
          </button>
          <div>
            <div className="text-sm font-semibold text-gray-900">SOMUN AI HQ</div>
            <div className="text-xs text-gray-400">{userName}</div>
          </div>
        </header>

        <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md pt-16 text-center text-sm text-gray-400">
              업무를 지시해보세요. 예) &quot;소문다이렉트의 온라인 신규고객 유입전략을
              검토해줘.&quot;
            </div>
          )}
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-[#1496F4] px-4 py-2.5 text-sm text-white sm:max-w-[70%]">
                    {m.content}
                  </div>
                </div>
              );
            }
            const parsed = parseAssistantContent(m.content);
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full max-w-[95%] sm:max-w-[80%]">
                  {parsed.kind === "task" ? (
                    <TaskResultCard
                      data={parsed.data}
                      status={taskStatus[parsed.data.taskId]}
                      onDecision={handleDecision}
                    />
                  ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700">
                      {parsed.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {sending && (
            <div className="text-xs text-gray-400">AI 조직이 검토하고 있습니다…</div>
          )}
          <div ref={bottomRef} />
        </main>

        <footer className="border-t border-gray-200 bg-white p-3 sm:p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="업무를 지시해보세요"
              rows={1}
              className="max-h-40 flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#1496F4] focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending || input.trim().length === 0}
              className="rounded-xl bg-[#1496F4] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
