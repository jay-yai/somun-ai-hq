import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

// 최초 1회만 방문하는 Google Drive 연동 시작 지점 (섹션 28).
// GOOGLE_DRIVE_CLIENT_ID / SECRET 이 .env.local에 설정되어 있어야 한다.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_DRIVE_CLIENT_ID가 설정되지 않았습니다." },
      { status: 400 }
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/setup/google-drive/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent", // 매번 refresh_token을 새로 발급받기 위함
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
