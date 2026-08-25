import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { runOrchestrator } from "@/lib/orchestrator";

// Agent 실행(특히 여러 팀 교차검토)은 수십 초~몇 분이 걸릴 수 있다.
// 응답을 아무 데이터 없이 오래 붙잡고 있으면 중간 네트워크/브라우저가 idle
// connection으로 판단해 끊어버릴 수 있다 (Vercel 공식 가이드에도 명시된
// 케이스). 그래서 이 라우트는 결과가 준비될 때까지 주기적으로 빈 바이트를
// 흘려보내(streaming heartbeat) 연결이 살아있게 유지한 뒤, 마지막에
// 실제 JSON 결과를 한 번에 보낸다. 클라이언트는 전체 텍스트를 받은 뒤
// trim()하고 JSON.parse() 한다 (선행 공백은 JSON 파싱에 영향 없음).
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 });
  }

  const body = await req.json();
  const message: string = body.message;
  let conversationId: string | undefined = body.conversationId;
  const taskId: string | undefined = body.taskId;
  const revisionNote: string | undefined = body.revisionNote;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "메시지를 입력해주세요." }), { status: 400 });
  }

  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: { userId: user.id, title: message.slice(0, 40) },
    });
    conversationId = conversation.id;
  } else {
    const conv = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.userId !== user.id) {
      return new Response(JSON.stringify({ error: "대화를 찾을 수 없습니다." }), { status: 404 });
    }
  }

  await db.message.create({
    data: { conversationId, role: "user", content: message },
  });

  const conversationIdFinal = conversationId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          // 스트림이 이미 닫혔으면 무시
        }
      }, 15000);

      const finish = (payload: unknown) => {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify(payload)));
        controller.close();
      };

      try {
        const result = await runOrchestrator({
          userId: user.id,
          conversationId: conversationIdFinal,
          userRequest: message,
          taskId,
          revisionNote,
        });

        if (result.error) {
          await db.message.create({
            data: { conversationId: conversationIdFinal, role: "assistant", content: `⚠️ ${result.error}` },
          });
          finish({ ...result, conversationId: conversationIdFinal });
          return;
        }

        await db.message.create({
          data: {
            conversationId: conversationIdFinal,
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
          where: { id: conversationIdFinal },
          data: { updatedAt: new Date() },
        });

        finish({ ...result, conversationId: conversationIdFinal });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          await db.message.create({
            data: {
              conversationId: conversationIdFinal,
              role: "assistant",
              content: `⚠️ 업무 처리 중 오류가 발생했습니다: ${errMsg}`,
            },
          });
        } catch {
          // 메시지 저장까지 실패해도 클라이언트에는 에러를 전달한다
        }
        finish({ error: errMsg, conversationId: conversationIdFinal });
      }
    },
    cancel() {
      // 클라이언트가 연결을 끊어도 서버 쪽 작업 자체는 이미 진행 중이므로 그대로 둔다.
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
