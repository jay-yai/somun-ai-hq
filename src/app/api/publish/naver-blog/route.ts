import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writePost } from "@/lib/naver/blog";

// 사용자가 초안을 검토하고 명시적으로 "게시" 버튼을 눌렀을 때만 호출된다.
// 자동/조용한 발행은 절대 하지 않는다 (공개 콘텐츠 게시는 매번 사용자 확인 필요).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json();
  const taskId: string | undefined = body.taskId;
  const title: string = body.title;
  const contents: string = body.contents;
  const categoryNo: number | undefined = body.categoryNo;

  if (!title || !contents) {
    return NextResponse.json({ error: "제목과 본문을 입력해주세요." }, { status: 400 });
  }

  if (taskId) {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: { conversation: true },
    });
    if (!task || task.conversation.userId !== user.id) {
      return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
    }
  }

  try {
    const result = await writePost({ title, contents, categoryNo });
    return NextResponse.json({ success: true, logNo: result.logNo });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
