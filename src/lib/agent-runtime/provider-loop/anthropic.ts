import Anthropic from "@anthropic-ai/sdk";
import type { ToolSpec, AgentStepLog } from "../types";
import type { ToolLoopParams, ToolLoopResult } from "./types";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function toAnthropicTool(spec: ToolSpec): Anthropic.Tool {
  return {
    name: spec.name,
    description: spec.description,
    input_schema: spec.parameters as unknown as Anthropic.Tool.InputSchema,
  };
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function runAnthropicToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const anthropic = getClient();
  const tools = params.tools.map(toAnthropicTool);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: params.userPrompt }];
  const steps: AgentStepLog[] = [];
  const maxTokens = params.maxOutputTokensPerStep ?? 4096;

  for (let stepNum = 1; stepNum <= params.maxSteps; stepNum++) {
    const start = Date.now();
    const res = await anthropic.messages.create({
      model: params.model,
      max_tokens: maxTokens,
      system: params.systemPrompt,
      tools,
      messages,
    });
    const latencyMs = Date.now() - start;
    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;

    const toolUseBlocks = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const finalBlock = toolUseBlocks.find((b) => b.name === params.requiredFinalTool);

    if (finalBlock) {
      steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
      return {
        finalToolArgs: finalBlock.input as Record<string, unknown>,
        fallbackText: extractText(res.content),
        steps,
      };
    }

    if (res.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
      messages.push({ role: "assistant", content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        let result: unknown;
        try {
          result = await params.executeTool(block.name, block.input as Record<string, unknown>);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
      steps.push({
        step: stepNum,
        type: "tool_call",
        toolName: toolUseBlocks.map((b) => b.name).join(","),
        inputTokens,
        outputTokens,
        latencyMs,
      });
      continue;
    }

    steps.push({ step: stepNum, type: "final_answer", inputTokens, outputTokens, latencyMs });
    return { finalToolArgs: null, fallbackText: extractText(res.content), steps };
  }

  return { finalToolArgs: null, fallbackText: "", steps };
}
