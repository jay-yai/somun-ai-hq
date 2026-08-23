import type { NextAuthConfig } from "next-auth";

// Edge 런타임(proxy.ts/middleware)에서도 안전하게 쓸 수 있는 최소 설정.
// Prisma(DB) 호출이 들어가는 콜백은 절대 여기에 넣지 않는다 — Edge 런타임은
// Prisma의 기본 쿼리 엔진(Node.js 바이너리)을 실행할 수 없기 때문이다.
// DB 로직이 필요한 콜백은 src/auth.ts(Node.js 런타임에서만 사용)에 정의한다.
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: { signIn: "/login" },
};
