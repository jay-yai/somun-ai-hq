import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// proxy.ts(미들웨어)는 Edge 런타임에서 실행되므로, Prisma(DB) 호출이 없는
// 경량 설정(authConfig)만 사용해 세션 존재 여부만 확인한다.
const { auth } = NextAuth(authConfig);

// 로그인하지 않은 사용자는 /login 으로 보낸다.
// /api/auth, /login, 정적 파일, PWA 관련 파일은 예외로 둔다.
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth");

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)",
  ],
};
