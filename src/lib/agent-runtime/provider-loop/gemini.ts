import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionCall,
  type Schema,
  type FunctionDeclarationSchema,
} from "@google/generative-ai";
import type { ToolParamSchema, JsonSchemaProperty, AgentStepLog } from "../types";
import type { ToolLoopParams, ToolLoopResult } from "./types";

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  return client;
}

function toGeminiType(t: string): SchemaType {
  switch (t) {
    case "object":
      return SchemaType.OBJECT;
    case "boolean":
      return SchemaType.BOOLEAN;
    case "array":
      return SchemaType.ARRAY;
    case "number":
      return SchemaType.NUMBER;
    default:
      return SchemaType.STRING;
  }
}

// 중첩된 object/array까지 재귀적으로 Gemini Schema 형식으로 변환한다.
// @google/generative-ai의 Schema 타입은 type별로 다른 필드를 요구하는 판별
// 유니온이라 우리 쪽 범용 JsonSchemaProperty와 1:1로 맞추기 어렵다 — 실제
// REST API는 아래 평범한 객체 형태를 그대로 받아들이므로 unknown을 거쳐 캐스팅한다.
function toGeminiProperty(prop: JsonSchemaProperty): Schema {
  const base: Record<string, unknown> = {
    type: toGeminiType(prop.type),
    description: prop.description,
    enum: prop.enum,
  };
  if (prop.type === "array" && prop.items) {
    base.items = toGeminiProperty(prop.items);
  }
  if (prop.type === "object" && prop.properties) {
    const properties: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(prop.properties)) {
      properties[key] = toGeminiProperty(val);
    }
    base.properties = properties;
    base.required = prop.required ?? [];
  }
  return base as unknown as Schema;
}

function toGeminiSchema(schema: ToolParamSchema): FunctionDeclarationSchema {
  const properties: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(schema.properties)) {
    properties[key] = toGeminiProperty(val);
  }
  return {
    type: SchemaType.OBJECT,
    properties,
    required: schema.required ?? [],
  } as unknown as FunctionDeclarationSchema;
}

export async function runGeminiToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const genAI = getClient();
  const functionDeclarations = params.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.parameters),
  }));

  const model = genAI.getGenerativeModel({
    model: params.model,
    systemInstruction: params.systemPrompt,
    tools: [{ functionDeclarations }],
  });
  const chat = model.startChat();
  const steps: AgentStepLog[] = [];

  let nextMessage: string | Array<{ functionResponse: { name: string; response: { result: unknown } } }> =
    params.userPrompt;

  for (let stepNum = 1; stepNum <= params.maxSteps; stepNum++) {
    const start = Date.now();
    const result = await chat.sendMessage(nextMessage);
    const latencyMs = Date.now() - start;
    const usage = result.response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    let calls: FunctionCall[] = [];
    try {
      calls = result.response.functionCalls() ?? [];
    } catch {
      calls = [];
    }

    const finalCall = calls.find((c) => c.name === params.requiredFinalTool);
    if (finalCall) {
      steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
      let text = "";
      try {
        text = result.response.text();
      } catch {
        text = "";
      }
      return { finalToolArgs: finalCall.args as Record<string, unknown>, fallbackText: text, steps };
    }

    if (calls.length > 0) {
      const responses: Array<{ functionResponse: { name: string; response: { result: unknown } } }> = [];
      for (const call of calls) {
        let res: unknown;
        try {
          res = await params.executeTool(call.name, (call.args ?? {}) as Record<string, unknown>);
        } catch (e) {
          res = { error: e instanceof Error ? e.message : String(e) };
        }
        responses.push({ functionResponse: { name: call.name, response: { result: res } } });
      }
      steps.push({
        step: stepNum,
        type: "tool_call",
        toolName: calls.map((c) => c.name).join(","),
        inputTokens,
        outputTokens,
        latencyMs,
      });
      nextMessage = responses;
      continue;
    }

    steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
    let text = "";
    try {
      text = result.response.text();
    } catch {
      text = "";
    }
    return { finalToolArgs: null, fallbackText: text, steps };
  }

  return { finalToolArgs: null, fallbackText: "", steps };
}
