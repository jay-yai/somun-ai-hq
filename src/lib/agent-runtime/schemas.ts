import { z } from "zod";

// LLM이 문자열 배열 필드를 콤마 문자열이나 단일 문자열로 채우는 경우가 흔해서,
// 검증 전에 문자열 하나를 배열로 보정해준다 (완전 실패 대신 관대하게 수용).
const stringArray = z.preprocess((v) => {
  if (typeof v === "string") return [v];
  return v;
}, z.array(z.string())).default([]);

// ==================================================
// STRUCTURED HANDOFF
// ==================================================
// Agent끼리 자유문장이 아니라 이 구조화된 객체로 업무를 전달한다.
export const AGENT_NAME_ENUM = ["orchestrator", "strategy", "product", "growth", "cs"] as const;

export const HandoffSchema = z.object({
  task_id: z.string(),
  from_agent: z.enum(AGENT_NAME_ENUM),
  to_agent: z.enum(AGENT_NAME_ENUM),
  objective: z.string().describe("이 Handoff로 상대 Agent가 달성해야 할 목표"),
  background: z.string().describe("배경 설명 (왜 이 업무가 필요한지)"),
  relevant_master_rules: stringArray,
  verified_facts: stringArray,
  assumptions: stringArray,
  questions: stringArray,
  risks: stringArray,
  required_output: z.string().describe("상대 Agent가 만들어야 할 산출물"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Handoff = z.infer<typeof HandoffSchema>;

// ==================================================
// AGENT OUTPUT SCHEMA (공통 베이스)
// ==================================================
// 모든 전문 Agent(Strategy/Product/Growth/CS)는 이 형태로 최종 결론을 낸다.
// LLM이 자유 텍스트를 반환하고 끝내는 게 아니라, submit_final_answer라는
// tool 호출을 통해 이 스키마를 채워야 루프가 종료된다.
export const AgentOutputSchema = z.object({
  summary: z.string().describe("한 줄 결론"),
  body: z.string().describe("전체 검토 내용 (마크다운 텍스트)"),
  approval_required: z
    .boolean()
    .default(false)
    .describe(
      "사업정의/브랜드 포지셔닝/수익구조/보상정책/핵심서비스/중요정책/고객데이터정책 변경이 필요하면 true"
    ),
  approval_reason: z.string().optional(),
  master_change_proposed: z
    .boolean()
    .default(false)
    .describe("SOMUNDIRECT MASTER 문서 자체의 수정이 필요하다고 판단되면 true"),
  risks: stringArray,
  handoff: HandoffSchema.partial({ task_id: true, from_agent: true }).optional().describe(
    "다른 팀(Product/Growth/CS)에게 후속 작업이 필요하면 Handoff 객체를 생성"
  ),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ==================================================
// ORCHESTRATOR ROUTING PLAN
// ==================================================
export const RoutingPlanSchema = z.object({
  reasoning: z.string().describe("왜 이 팀들을 선택했는지 짧은 근거"),
  agents: z
    .array(z.enum(["strategy", "product", "growth", "cs"]))
    .min(1)
    .describe("이 업무에 실제로 필요한 팀만 선택 (불필요한 팀 포함 금지)"),
  cross_review_needed: z
    .boolean()
    .describe("2개 이상 팀이 선택된 경우, Strategy가 최종 종합해야 하면 true"),
});
export type RoutingPlan = z.infer<typeof RoutingPlanSchema>;

// zod 스키마 -> tool 호출용 JSON Schema (properties 목록)으로 변환할 때 쓰는 헬퍼.
// 스키마가 소규모/고정이므로 완전 자동 변환 라이브러리 대신 직접 명세한다.
