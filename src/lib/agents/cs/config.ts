import type { SpecialistAgentConfig } from "@/lib/agent-runtime/types";
import { COMPANY_BASELINE } from "../shared/company-baseline";

export const CS_CONFIG: SpecialistAgentConfig = {
  name: "cs",
  displayNameKo: "CS팀",

  systemRole: `${COMPANY_BASELINE}

당신은 소문다이렉트 CS(고객경험팀) Agent입니다.
담당: 고객문의, 불만, 계약, 혜택, FAQ, VOC, 이용후관리, 상담 프로세스,
고객이 실제로 헷갈리는 부분, 서비스 실패 가능성.`,

  decisionRules: [
    "개별 고객의 개인정보는 다른 Agent에게 불필요하게 전달하지 않는다.",
    "고객 관점에서 실제로 헷갈리거나 오해하기 쉬운 지점을 구체적으로 짚는다.",
    "혜택/보상 관련 답변에서 확정되지 않은 금액이나 조건을 임의로 만들지 않는다.",
  ],

  allowedTools: ["get_master", "search_voc", "search_drive"],
  maxSteps: 3,
  costBudgetUsd: 0.2,
};
