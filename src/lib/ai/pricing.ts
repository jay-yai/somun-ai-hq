// 모델별 예상 비용(USD / 1M 토큰) 테이블.
// 가격은 주기적으로 바뀌므로, 실제 청구서와 차이가 나면 이 파일만 수정하면 된다.
// (Anthropic 가격은 2026-08 기준 공식 가격이며, OpenAI/Gemini는 대략치이므로
//  Settings 화면에서 실제 청구 내역과 비교해 조정하는 것을 권장한다.)

interface PriceRow {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, PriceRow> = {
  // --- Anthropic (2026-08 공식 가격) ---
  "claude-opus-5": { inputPer1M: 5.0, outputPer1M: 25.0 },
  "claude-sonnet-5": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5": { inputPer1M: 1.0, outputPer1M: 5.0 },

  // --- OpenAI (대략치 — 실제 청구서 확인 후 조정 권장) ---
  "gpt-5": { inputPer1M: 5.0, outputPer1M: 15.0 },
  "gpt-5-mini": { inputPer1M: 0.5, outputPer1M: 2.0 },

  // --- Google Gemini (대략치 — 실제 청구서 확인 후 조정 권장) ---
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const row = PRICING[model];
  if (!row) return 0; // 알 수 없는 모델은 비용 0으로 기록하고 로그만 남긴다.
  return (
    (inputTokens / 1_000_000) * row.inputPer1M +
    (outputTokens / 1_000_000) * row.outputPer1M
  );
}
