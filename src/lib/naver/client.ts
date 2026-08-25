// 네이버 로그인 OAuth2 — 발급받은 Refresh Token으로 매번 새 Access Token을 받아온다.
// (네이버 Access Token은 수명이 짧아서, Google Drive처럼 Refresh Token만 저장해두고
// 실제 게시할 때마다 갱신한다.)

export function isNaverBlogConfigured(): boolean {
  return Boolean(
    process.env.NAVER_CLIENT_ID &&
      process.env.NAVER_CLIENT_SECRET &&
      process.env.NAVER_REFRESH_TOKEN
  );
}

interface NaverTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: string;
  error?: string;
  error_description?: string;
}

export async function getNaverAccessToken(): Promise<string> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const refreshToken = process.env.NAVER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("네이버 블로그 연동이 설정되지 않았습니다 (.env의 NAVER_* 값을 확인하세요).");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
  const data = (await res.json()) as NaverTokenResponse;

  if (!data.access_token) {
    throw new Error(
      `네이버 Access Token 갱신 실패: ${data.error_description ?? data.error ?? "알 수 없는 오류"}`
    );
  }
  return data.access_token;
}
