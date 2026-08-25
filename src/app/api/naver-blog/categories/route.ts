import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isNaverBlogConfigured } from "@/lib/naver/client";
import { listCategories } from "@/lib/naver/blog";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isNaverBlogConfigured()) {
    return NextResponse.json({ configured: false, categories: [] });
  }

  try {
    const categories = await listCategories();
    return NextResponse.json({ configured: true, categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
