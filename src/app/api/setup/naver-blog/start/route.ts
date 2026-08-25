import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

// 최초 1회만 방문하는 네이버 블로그 연동 시작 지점.
// NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 .env.local에 설정되어 있어야 한다.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "NAVER_CLIENT_ID가 설정되지 않았습니다." },
      { status: 400 }
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/setup/naver-blog/callback`;
  const state = Math.random().toString(36).slice(2);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`);
}
