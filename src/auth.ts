import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";

// 허용된 이메일만 로그인할 수 있도록 화이트리스트로 제한한다.
// (SOMUN AI HQ는 내부 전용 서비스이며, 공개 가입을 허용하지 않는다.)
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// 이 파일은 Node.js 런타임(API 라우트, 서버 컴포넌트)에서만 import한다.
// Prisma(DB) 호출이 포함된 완전한 설정이며, Edge 런타임인 proxy.ts에서는
// 대신 src/auth.config.ts의 경량 설정을 사용한다.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      const allowed = getAllowedEmails();
      if (!user.email) return false;
      if (!allowed.includes(user.email.toLowerCase())) {
        // 화이트리스트에 없는 계정은 로그인 자체를 거부한다.
        return false;
      }

      // 최초 로그인 시 DB에 사용자 레코드가 없으면 생성한다.
      await db.user.upsert({
        where: { email: user.email },
        update: { name: user.name, image: user.image },
        create: {
          email: user.email,
          name: user.name,
          image: user.image,
        },
      });

      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: session.user.email },
        });
        if (dbUser) {
          (session.user as typeof session.user & { id: string }).id =
            dbUser.id;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
