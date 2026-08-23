import type { AgentName } from "@/lib/ai/model-config";

// MVP 버전 분류기: 키워드 기반으로 어떤 팀이 필요한지 판단한다.
// 별도 API 호출 없이 즉시(무료로) 판단하므로 비용이 들지 않는다.
// 정확도를 높이고 싶으면 나중에 저비용 모델 호출로 교체할 수 있다.
const KEYWORDS: Record<AgentName, string[]> = {
  strategy: [
    "전략",
    "포지셔닝",
    "브랜드",
    "시장조사",
    "경쟁사",
    "사업",
    "수익모델",
    "우선순위",
    "신규서비스",
    "방향성",
  ],
  product: [
    "개발",
    "기능",
    "웹사이트",
    "홈페이지",
    "사이트",
    "앱",
    "구현",
    "자동화",
    "crm",
    "관리자",
    "mvp",
    "시스템",
    "만들",
  ],
  growth: [
    "마케팅",
    "seo",
    "블로그",
    "sns",
    "유튜브",
    "콘텐츠",
    "키워드",
    "캠페인",
    "유입",
    "전환",
    "cta",
    "알리",
    "홍보",
    "광고",
  ],
  cs: [
    "고객문의",
    "faq",
    "불만",
    "혜택 문의",
    "계약 문의",
    "voc",
    "상담",
    "헷갈",
    "문의",
    "클레임",
    "지급시점",
  ],
};

export function classifyAgents(userRequest: string): AgentName[] {
  const text = userRequest.toLowerCase();
  const matched = (Object.keys(KEYWORDS) as AgentName[]).filter((agent) =>
    KEYWORDS[agent].some((kw) => text.includes(kw.toLowerCase()))
  );

  if (matched.length === 0) {
    // 어떤 키워드에도 걸리지 않으면 기본적으로 Strategy가 1차 판단한다.
    return ["strategy"];
  }

  // 2개 이상 팀이 필요하면 Strategy를 항상 포함시켜 최종 종합을 담당하게 한다.
  if (matched.length > 1 && !matched.includes("strategy")) {
    matched.push("strategy");
  }

  return matched;
}
