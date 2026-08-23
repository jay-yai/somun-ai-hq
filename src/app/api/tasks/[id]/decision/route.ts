import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { resaveTaskWithStatus, runOrchestrator } from "@/lib/orchestrator";

// 섹션 24: 승인 / 수정 요청 / 보류
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id: taskId } = await params;
  const body = await req.json();
  const decision: "APPROVED" | "HOLD" | "REVISION_REQUESTED" = body.decision;
  const note: string | undefined = body.note;

  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { conversation: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!task || task.conversation.userId !== user.id) {
    return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  }

  const latestVersion = task.versions[0];
  if (latestVersion) {
    await db.taskVersion.update({
      where: { id: latestVersion.id },
      data: { userDecision: decision, userNote: note },
    });
  }

  if (decision === "APPROVED") {
    // 중요 정책 변경 여부는 최종결론 텍스트에 "[사용자 승인 필요]" 마커로 표시되도록
    // Agent 프롬프트에서 유도하고 있다. 여기서는 사용자가 명시적으로 승인한 것으로 처리한다.
    await resaveTaskWithStatus(taskId, "APPROVED");
    return NextResponse.json({ status: "APPROVED" });
  }

  if (decision === "HOLD") {
    await resaveTaskWithStatus(taskId, "HOLD");
    return NextResponse.json({ status: "HOLD" });
  }

  if (decision === "REVISION_REQUESTED") {
    if (!note || note.trim().length === 0) {
      return NextResponse.json(
        { error: "수정 요청 시 의견을 입력해주세요." },
        { status: 400 }
      );
    }
    await db.task.update({ where: { id: taskId }, data: { status: "RESEARCH" } });
    const result = await runOrchestrator({
      userId: user.id,
      conversationId: task.conversationId,
      userRequest: latestVersion?.userRequest ?? task.title,
      taskId,
      revisionNote: note,
    });

    await db.message.create({
      data: {
        conversationId: task.conversationId,
        role: "assistant",
        content: JSON.stringify({
          taskId: result.taskId,
          agentsInvolved: result.agentsInvolved,
          opinions: result.opinions,
          finalConclusion: result.finalConclusion,
        }),
      },
    });

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "알 수 없는 decision 값입니다." }, { status: 400 });
}
