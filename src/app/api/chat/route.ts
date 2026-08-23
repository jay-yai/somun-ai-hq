import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { runOrchestrator } from "@/lib/orchestrator";

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

  let result;
  try {
    result = await runOrchestrator({
      userId: user.id,
      conversationId,
      userRequest: message,
      taskId,
      revisionNote,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: `⚠️ 업무 처리 중 오류가 발생했습니다: ${errMsg}`,
      },
    });
    return NextResponse.json(
      { error: errMsg, conversationId },
      { status: 500 }
    );
  }

  if (result.error) {
    await db.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: `⚠️ ${result.error}`,
      },
    });
    return NextResponse.json({ ...result, conversationId }, { status: 502 });
  }

  await db.message.create({
    data: {
      conversationId,
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
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ...result, conversationId });
}
