import { getNaverAccessToken } from "./client";

export interface NaverBlogCategory {
  categoryNo: number;
  name: string;
}

// 카테고리 목록 조회 (게시 전 사용자가 고를 수 있게).
export async function listCategories(): Promise<NaverBlogCategory[]> {
  const token = await getNaverAccessToken();
  const res = await fetch("https://openapi.naver.com/blog/listCategory.json", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const list = data?.result?.categoryList ?? [];
  return list.map((c: { categoryNo: number; categoryName: string }) => ({
    categoryNo: c.categoryNo,
    name: c.categoryName,
  }));
}

// 텍스트(줄바꿈 기준)를 네이버 블로그 글쓰기 API가 받는 간단한 HTML로 변환한다.
function toSimpleHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export interface WriteNaverPostParams {
  title: string;
  contents: string; // 일반 텍스트 (자동으로 간단한 HTML로 변환됨)
  categoryNo?: number;
}

export interface WriteNaverPostResult {
  logNo?: string;
  raw: unknown;
}

// 실제로 네이버 블로그에 글을 발행한다. 반드시 사용자가 내용을 검토하고
// 명시적으로 "게시" 버튼을 눌렀을 때만 호출해야 한다 (자동/조용한 발행 금지).
export async function writePost(params: WriteNaverPostParams): Promise<WriteNaverPostResult> {
  const token = await getNaverAccessToken();

  const form = new URLSearchParams();
  form.set("title", params.title);
  form.set("contents", toSimpleHtml(params.contents));
  if (params.categoryNo != null) form.set("categoryNo", String(params.categoryNo));

  const res = await fetch("https://openapi.naver.com/blog/writePost.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = await res.json();
  if (!res.ok || data?.message === "fail" || data?.errorCode) {
    throw new Error(
      `네이버 블로그 게시 실패: ${data?.message ?? data?.errorMessage ?? res.status}`
    );
  }
  return { logNo: data?.result?.logNo, raw: data };
}
