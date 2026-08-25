import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/current-user";

// 네이버 인증 후 돌아오는 지점. Refresh Token을 발급받아
// 로컬 개발 환경(.env.local)에는 자동으로 저장하고,
// 배포 환경(Vercel 등)에서는 화면에 표시만 해서 사용자가 직접 등록하게 한다.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(`네이버 인증이 취소되었습니다: ${error}`, { status: 400 });
  }
  if (!code) {
    return new NextResponse("인증 코드가 없습니다.", { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse("NAVER_CLIENT_ID/SECRET이 설정되지 않았습니다.", { status: 400 });
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    state: state ?? "",
  });

  const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
  const tokenData = await tokenRes.json();
  const refreshToken: string | undefined = tokenData.refresh_token;

  if (!refreshToken) {
    return new NextResponse(
      `Refresh Token을 받지 못했습니다: ${tokenData.error_description ?? tokenData.error ?? "알 수 없는 오류"}`,
      { status: 400 }
    );
  }

  let savedToFile = false;
  if (process.env.NODE_ENV !== "production") {
    try {
      const envPath = path.join(process.cwd(), ".env.local");
      let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
      content = upsertEnvVar(content, "NAVER_REFRESH_TOKEN", refreshToken);
      fs.writeFileSync(envPath, content);
      savedToFile = true;
    } catch {
      savedToFile = false;
    }
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;">
      <h2>✅ 네이버 블로그 연결 완료</h2>
      ${
        savedToFile
          ? `<p>.env.local 파일에 NAVER_REFRESH_TOKEN이 자동 저장되었습니다. 개발 서버를 재시작해주세요.</p>`
          : `<p>아래 값을 배포 환경의 환경변수(NAVER_REFRESH_TOKEN)에 등록해주세요:</p>
             <pre style="background:#f4f4f4;padding:12px;border-radius:8px;word-break:break-all;">${refreshToken}</pre>`
      }
    </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? "\n" : ""}${line}\n`;
}
