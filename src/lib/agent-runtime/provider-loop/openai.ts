import OpenAI from "openai";
import type { ToolSpec, AgentStepLog } from "../types";
import type { ToolLoopParams, ToolLoopResult } from "./types";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function toOpenAITool(spec: ToolSpec): OpenAI.Chat.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters as unknown as Record<string, unknown>,
    },
  };
}

export async function runOpenAIToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const openai = getClient();
  const tools = params.tools.map(toOpenAITool);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userPrompt },
  ];
  const steps: AgentStepLog[] = [];

  for (let stepNum = 1; stepNum <= params.maxSteps; stepNum++) {
    const start = Date.now();
    const res = await openai.chat.completions.create({
      model: params.model,
      messages,
      tools,
      tool_choice: "auto",
    });
    const latencyMs = Date.now() - start;
    const msg = res.choices[0].message;
    const inputTokens = res.usage?.prompt_tokens ?? 0;
    const outputTokens = res.usage?.completion_tokens ?? 0;

    const toolCalls = msg.tool_calls ?? [];
    const finalCall = toolCalls.find(
      (tc) => tc.type === "function" && tc.function.name === params.requiredFinalTool
    );

    if (finalCall && finalCall.type === "function") {
      steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(finalCall.function.arguments);
      } catch {
        // 파싱 실패 시 빈 객체로 처리 — 상위에서 zod 검증 실패로 이어져 에러 핸들링됨
      }
      return { finalToolArgs: args, fallbackText: msg.content ?? "", steps };
    }

    if (toolCalls.length > 0) {
      messages.push(msg);
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          // ignore malformed args, executor will see empty object
        }
        let result: unknown;
        try {
          result = await params.executeTool(tc.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      steps.push({
        step: stepNum,
        type: "tool_call",
        toolName: toolCalls.map((t) => (t.type === "function" ? t.function.name : "?")).join(","),
        inputTokens,
        outputTokens,
        latencyMs,
      });
      continue;
    }

    // tool 호출 없이 텍스트로 끝냄 — fallback으로 처리
    steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
    return { finalToolArgs: null, fallbackText: msg.content ?? "", steps };
  }

  return { finalToolArgs: null, fallbackText: "", steps };
}
