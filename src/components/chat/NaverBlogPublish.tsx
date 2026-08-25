"use client";

import { useState } from "react";

interface Category {
  categoryNo: number;
  name: string;
}

// Growth팀 결과에서 "네이버 블로그에 게시" 버튼 → 검토/수정 → 명시적 게시.
// 자동으로 조용히 올라가는 일은 없다 — 항상 사용자가 내용을 보고 직접 눌러야 한다.
export function NaverBlogPublish({
  taskId,
  defaultBody,
}: {
  taskId: string;
  defaultBody: string;
}) {
  const [open, setOpen] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryNo, setCategoryNo] = useState<number | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(defaultBody);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function openForm() {
    setOpen(true);
    if (configured !== null) return;
    setLoadingCats(true);
    try {
      const res = await fetch("/api/naver-blog/categories");
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      const cats: Category[] = data.categories ?? [];
      setCategories(cats);
      if (cats[0]) setCategoryNo(cats[0].categoryNo);
    } finally {
      setLoadingCats(false);
    }
  }

  async function publish() {
    if (!title.trim() || !body.trim() || publishing) return;
    setPublishing(true);
    setResult(null);
    try {
      const res = await fetch("/api/publish/naver-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, title, contents: body, categoryNo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setResult("error");
        setErrorMsg(data.error ?? "게시에 실패했습니다.");
      } else {
        setResult("success");
      }
    } catch {
      setResult("error");
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setPublishing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="rounded-lg border border-[#03C75A] px-4 py-2 text-xs font-medium text-[#03C75A]"
      >
        네이버 블로그에 게시
      </button>
    );
  }

  if (result === "success") {
    return (
      <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
        네이버 블로그에 게시되었습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      {loadingCats ? (
        <div className="text-xs text-gray-400">연결 상태 확인 중…</div>
      ) : configured === false ? (
        <div className="text-xs text-amber-600">
          네이버 블로그가 아직 연결되지 않았습니다. <code>/setup</code> 페이지에서 먼저
          연결해주세요.
        </div>
      ) : (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="블로그 제목"
            className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-[#03C75A] focus:outline-none"
          />
          {categories.length > 0 && (
            <select
              value={categoryNo}
              onChange={(e) => setCategoryNo(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.categoryNo} value={c.categoryNo}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-[#03C75A] focus:outline-none"
          />
          {result === "error" && <div className="text-xs text-red-600">{errorMsg}</div>}
          <div className="flex gap-2">
            <button
              disabled={publishing || !title.trim()}
              onClick={publish}
              className="rounded-lg bg-[#03C75A] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {publishing ? "게시 중…" : "게시하기"}
            </button>
            <button
              disabled={publishing}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
