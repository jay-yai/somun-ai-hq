import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { runOrchestrator } from "@/lib/orchestrator";

// Agent 실행(특히 여러 팀 교차검토)은 수십 초~수 분이 걸릴 수 있다.
// 하나의 HTTP 연결을 그만큼 붙잡고 있으면 중간 네트워크/브라우저가 idle
// connection으로 판단해 끊어버릴 수 있으므로(비용은 이미 청구된 뒤),
// 이 라우트는 접수만 빠르게 응답하고 실제 처리는 after()로 응답 이후에 계속한다.
// 클라이언트는 /api/conversations/[id]를 폴링해서 완료를 감지한다.
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json();
  const message: string = body.message;
  let conversationId: string | undefined = body.conversationId;
  const taskId: string | undefined = body.taskId;
  const revisionNote: string | undefined = body.revisionNote;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });
  }

  // 새 대화면 생성
  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: {
        userId: user.id,
        title: message.slice(0, 40),
      },
    });
    conversationId = conversation.id;
  } else {
    // 본인 대화가 맞는지 확인 (다른 사용자 대화에 접근 방지)
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.userId !== user.id) {
      return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
    }
  }

  await db.message.create({
    data: { conversationId, role: "user", content: message },
  });

  const conversationIdForClosure = conversationId;

  // 응답을 먼저 보낸 뒤 백그라운드에서 실제 Agent 실행을 계속한다.
  after(async () => {
    try {
      const result = await runOrchestrator({
        userId: user.id,
        conversationId: conversationIdForClosure,
        userRequest: message,
        taskId,
        revisionNote,
      });

      if (result.error) {
        await db.message.create({
          data: {
            conversationId: conversationIdForClosure,
            role: "assistant",
            content: `⚠️ ${result.error}`,
          },
        });
        return;
      }

      await db.message.create({
        data: {
          conversationId: conversationIdForClosure,
          role: "assistant",
          content: JSON.stringify({
            taskId: result.taskId,
            agentsInvolved: result.agentsInvolved,
            opinions: result.opinions,
            finalConclusion: result.finalConclusion,
          }),
        },
      });

      await db.conversation.update({
        where: { id: conversationIdForClosure },
        data: { updatedAt: new Date() },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.message.create({
        data: {
          conversationId: conversationIdForClosure,
          role: "assistant",
          content: `⚠️ 업무 처리 중 오류가 발생했습니다: ${errMsg}`,
        },
      });
    }
  });

  return NextResponse.json({ conversationId, accepted: true });
}
