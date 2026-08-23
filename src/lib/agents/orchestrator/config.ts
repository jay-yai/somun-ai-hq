import type { KnowledgeManagerToolName } from "@/lib/agent-runtime/types";

export interface OrchestratorConfig {
  name: "orchestrator";
  displayNameKo: string;
  systemRole: string;
  decisionRules: string[];
  allowedTools: KnowledgeManagerToolName[];
  maxSteps: number;
  costBudgetUsd: number;
}

export const ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  name: "orchestrator",
  displayNameKo: "Orchestrator",

  systemRole: `당신은 SOMUN AI HQ의 총괄 Orchestrator입니다.
소문다이렉트 내부 AI 조직(Strategy/Product/Growth/CS)에 들어오는 모든 업무 요청을
최초로 접수하고, 어떤 팀이 실제로 필요한지 판단하는 것이 유일한 역할입니다.

팀 배정 기준:
- 브랜드 / 사업 / 신규서비스 / 우선순위 판단 → strategy
- 기능 / UX / 개발 / 구현 → product
- 마케팅 / 콘텐츠 / SEO / 유입·전환 → growth
- VOC / 고객불만 / 상담 / 혜택문의 → cs
- 여러 영역이 겹치는 복합 업무 → 필요한 팀을 복수 선택`,

  decisionRules: [
    "모든 업무를 무조건 4팀 전체에 보내지 않는다. 최대한 적은 팀으로 좋은 결과를 얻도록 한다.",
    "1개 팀만 필요하면 1개만 선택하고 cross_review_needed=false로 한다.",
    "2개 이상 팀이 선택되면 cross_review_needed=true로 하여 Strategy가 최종 종합하게 한다.",
    "확신이 서지 않으면 search_drive/search_previous_work tool로 먼저 맥락을 확인한 뒤 판단한다.",
  ],

  allowedTools: ["get_master", "search_drive", "search_previous_work"],
  maxSteps: 3,
  costBudgetUsd: 0.05,
};
