import type { AgentName } from "@/lib/ai/model-config";

export interface DriveContextDoc {
  id: string;
  name: string;
  path: string; // 예: 01_STRATEGY/친구추천_전략.md
  content: string; // 관련 발췌 (전체 Drive를 넣지 않는다)
}

export interface OrchestratorContext {
  userRequest: string;
  masterSummary: string; // MASTER 문서에서 추출한 핵심 원칙 요약
  relatedDocs: DriveContextDoc[]; // Knowledge Manager가 골라준 관련 자료
  previousConclusion?: string; // 이전 업무 이어하기 시, 과거 결론
}

export interface AgentOutput {
  agent: AgentName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface CrossReviewInput {
  context: OrchestratorContext;
  opinions: Partial<Record<AgentName, string>>;
}
