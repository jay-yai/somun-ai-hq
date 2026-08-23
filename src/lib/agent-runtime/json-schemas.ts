// 각 zod 스키마(schemas.ts)에 대응하는 provider-tool용 JSON Schema.
// LLM은 "submit_final_answer" / "submit_routing_plan" tool을 호출해 이 형태로
// 결과를 제출해야 하고, 우리는 그 인자를 zod로 다시 검증한다 (Output Schema 강제).
import type { ToolParamSchema } from "./types";

const HANDOFF_JSON_SCHEMA: ToolParamSchema = {
  type: "object",
  properties: {
    to_agent: {
      type: "string",
      enum: ["strategy", "product", "growth", "cs"],
      description: "이 Handoff를 받을 팀",
    },
    objective: { type: "string", description: "상대 팀이 달성해야 할 목표" },
    background: { type: "string", description: "배경 설명" },
    relevant_master_rules: { type: "array", items: { type: "string" } },
    verified_facts: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    required_output: { type: "string", description: "상대 팀이 만들어야 할 산출물" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["to_agent", "objective", "background", "required_output"],
};

export const AGENT_OUTPUT_JSON_SCHEMA: ToolParamSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "한 줄 결론" },
    body: { type: "string", description: "전체 검토 내용 (마크다운 텍스트)" },
    approval_required: {
      type: "boolean",
      description:
        "사업정의/브랜드 포지셔닝/수익구조/보상정책/핵심서비스/중요정책/고객데이터정책 변경이 필요하면 true",
    },
    approval_reason: { type: "string" },
    master_change_proposed: {
      type: "boolean",
      description: "SOMUNDIRECT MASTER 문서 자체 수정이 필요하다고 판단되면 true",
    },
    risks: { type: "array", items: { type: "string" }, description: "리스크/반론 목록" },
    handoff: {
      ...HANDOFF_JSON_SCHEMA,
      description: "다른 팀에게 후속 작업이 필요하면 생성 (필요 없으면 생략)",
    },
  },
  required: ["summary", "body"],
};

export const ROUTING_PLAN_JSON_SCHEMA: ToolParamSchema = {
  type: "object",
  properties: {
    reasoning: { type: "string", description: "왜 이 팀들을 선택했는지 짧은 근거" },
    agents: {
      type: "array",
      items: { type: "string", enum: ["strategy", "product", "growth", "cs"] },
      description: "이 업무에 실제로 필요한 팀만 선택",
    },
    cross_review_needed: {
      type: "boolean",
      description: "2개 이상 팀이 선택된 경우 Strategy 최종 종합이 필요하면 true",
    },
  },
  required: ["reasoning", "agents", "cross_review_needed"],
};
