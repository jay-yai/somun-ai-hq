import { NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/current-user";

// Google 인증 후 돌아오는 지점. Refresh Token을 발급받아
// 로컬 개발 환경(.env.local)에는 자동으로 저장하고,
// 배포 환경(Vercel 등)에서는 화면에 표시만 해서 사용자가 직접 등록하게 한다.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(`Google 인증이 취소되었습니다: ${error}`, { status: 400 });
  }
  if (!code) {
    return new NextResponse("인증 코드가 없습니다.", { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    `${url.origin}/api/setup/google-drive/callback`
  );

  const { tokens } = await oauth2Client.getToken(code);
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    return new NextResponse(
      "Refresh Token을 받지 못했습니다. Google 계정 설정에서 이 앱의 접근권한을 제거한 뒤 다시 시도해주세요. (설정 > 보안 > 타사 앱 액세스)",
      { status: 400 }
    );
  }

  let savedToFile = false;
  if (process.env.NODE_ENV !== "production") {
    try {
      const envPath = path.join(process.cwd(), ".env.local");
      let content = fs.existsSync(envPath)
        ? fs.readFileSync(envPath, "utf-8")
        : "";
      content = upsertEnvVar(content, "GOOGLE_DRIVE_REFRESH_TOKEN", refreshToken);
      fs.writeFileSync(envPath, content);
      savedToFile = true;
    } catch {
      savedToFile = false;
    }
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;">
      <h2>✅ Google Drive 연결 완료</h2>
      ${
        savedToFile
          ? `<p>.env.local 파일에 GOOGLE_DRIVE_REFRESH_TOKEN이 자동 저장되었습니다. 개발 서버를 재시작해주세요.</p>`
          : `<p>아래 값을 배포 환경의 환경변수(GOOGLE_DRIVE_REFRESH_TOKEN)에 등록해주세요:</p>
             <pre style="background:#f4f4f4;padding:12px;border-radius:8px;word-break:break-all;">${refreshToken}</pre>`
      }
      <p>또한 GOOGLE_DRIVE_ROOT_FOLDER_ID가 아직 없다면 회사 Drive 폴더 URL에서 ID를 복사해 함께 등록해주세요.</p>
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
