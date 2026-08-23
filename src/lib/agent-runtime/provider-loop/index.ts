import type { Provider } from "../types";
import type { ToolLoopParams, ToolLoopResult } from "./types";
import { runOpenAIToolLoop } from "./openai";
import { runAnthropicToolLoop } from "./anthropic";
import { runGeminiToolLoop } from "./gemini";

export type { ToolLoopParams, ToolLoopResult };

// Provider(OpenAI/Anthropic/Gemini)를 추상화한 단일 진입점.
// Agent 코드는 어떤 provider를 쓰는지 몰라도 되고, model-config.ts에서만 결정된다.
export async function runToolLoop(
  provider: Provider,
  params: ToolLoopParams
): Promise<ToolLoopResult> {
  switch (provider) {
    case "openai":
      return runOpenAIToolLoop(params);
    case "anthropic":
      return runAnthropicToolLoop(params);
    case "gemini":
      return runGeminiToolLoop(params);
  }
}
