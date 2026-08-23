import { auth } from "@/auth";
import { db } from "@/lib/db";

// 로그인한 사용자의 DB User 레코드를 가져온다. 로그인하지 않았다면 null을 반환한다.
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return db.user.findUnique({ where: { email: session.user.email } });
}
