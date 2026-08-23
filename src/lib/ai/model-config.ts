// 모델명을 코드 여러 곳에 하드코딩하지 않고, 이 파일과 .env에서만 관리한다.
// 업무 난이도(tier)에 따라 팀별로 다른 모델을 선택할 수 있다.

export type AgentName = "orchestrator" | "strategy" | "product" | "growth" | "cs";
export type ModelTier = "default" | "high";

export type Provider = "openai" | "anthropic" | "gemini";

interface AgentModelSpec {
  provider: Provider;
  envKeys: Record<ModelTier, string>;
}

const AGENT_MODEL_MAP: Record<AgentName, AgentModelSpec> = {
  orchestrator: {
    provider: "openai",
    envKeys: { default: "ORCHESTRATOR_MODEL_DEFAULT", high: "ORCHESTRATOR_MODEL_DEFAULT" },
  },
  strategy: {
    provider: "openai",
    envKeys: { default: "STRATEGY_MODEL_DEFAULT", high: "STRATEGY_MODEL_HIGH" },
  },
  product: {
    provider: "anthropic",
    envKeys: { default: "PRODUCT_MODEL_DEFAULT", high: "PRODUCT_MODEL_HIGH" },
  },
  growth: {
    provider: "gemini",
    envKeys: { default: "GROWTH_MODEL_DEFAULT", high: "GROWTH_MODEL_HIGH" },
  },
  cs: {
    provider: "openai",
    envKeys: { default: "CS_MODEL_DEFAULT", high: "CS_MODEL_HIGH" },
  },
};

export function getAgentProvider(agent: AgentName): Provider {
  return AGENT_MODEL_MAP[agent].provider;
}

export function resolveModel(agent: AgentName, tier: ModelTier = "default"): string {
  const spec = AGENT_MODEL_MAP[agent];
  const envKey = spec.envKeys[tier];
  const model = process.env[envKey];
  if (!model) {
    throw new Error(
      `[model-config] ${envKey} 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.`
    );
  }
  return model;
}
