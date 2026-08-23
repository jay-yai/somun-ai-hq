// 팀별 프로필 아바타. 실존 인물 사진 대신, 팀을 구분할 수 있는
// 일러스트 아바타를 사용한다 (초상권 문제 없이 "채팅 참여자" 느낌을 준다).
export const AGENT_LABELS_KO: Record<string, string> = {
  strategy: "전략기획팀",
  product: "개발팀",
  growth: "마케팅팀",
  cs: "CS팀",
};

const SKIN = "#E8B48C";
const SKIN_SHADOW = "#D89F72";

function Face({ hair, bg }: { hair: React.ReactNode; bg: string }) {
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <circle cx="20" cy="20" r="20" fill={bg} />
      {/* 목/어깨 */}
      <path d="M12 34c1-5 4-7 8-7s7 2 8 7" fill={SKIN_SHADOW} />
      {/* 얼굴 */}
      <circle cx="20" cy="18" r="8.5" fill={SKIN} />
      {hair}
      {/* 눈 */}
      <circle cx="17" cy="18.5" r="1.1" fill="#3a2a20" />
      <circle cx="23" cy="18.5" r="1.1" fill="#3a2a20" />
      {/* 입 */}
      <path d="M17 22.5c1 1.2 5 1.2 6 0" stroke="#8a5a3f" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function StrategyAvatar() {
  return (
    <Face
      bg="#1E3A5F"
      hair={<path d="M11 15c0-5 4-8.5 9-8.5s9 3.5 9 8.5c-1.5-1.5-3-2.5-4.5-2.7.3.8.3 1.6.1 2.3-2-2.3-4.5-3-7.3-2.6.4.6.5 1.2.4 1.8-2-1-4.5-.4-6.7 1.2z" fill="#2b2016" />}
    />
  );
}

function ProductAvatar() {
  return (
    <Face
      bg="#0F766E"
      hair={
        <>
          <path d="M11 15.5c.5-5.5 4.3-9 9-9s8.5 3.5 9 9c-1-1.8-3-3-6-3.2.6.7.8 1.4.7 2-3-1.6-6.5-1.8-9.5-.5.3.6.3 1.2.1 1.8-1.5-.6-2.7-.3-3.3 1z" fill="#241f1a" />
          {/* 안경 */}
          <rect x="14" y="17.3" width="5" height="3.4" rx="1.4" fill="none" stroke="#1f2937" strokeWidth="0.9" />
          <rect x="21" y="17.3" width="5" height="3.4" rx="1.4" fill="none" stroke="#1f2937" strokeWidth="0.9" />
          <line x1="19" y1="18.7" x2="21" y2="18.7" stroke="#1f2937" strokeWidth="0.9" />
        </>
      }
    />
  );
}

function GrowthAvatar() {
  return (
    <Face
      bg="#C2410C"
      hair={
        <>
          <path d="M11 16c-.3-5.6 3.8-9.6 9-9.6s9.3 4 9 9.6c-1.3-2.3-3.4-3.7-6-4 .4.7.5 1.4.3 2.1-2.2-2-5-2.6-7.7-1.9.4.6.5 1.3.3 1.9-2-.6-3.7 0-4.9 1.9z" fill="#241a12" />
          {/* 옆머리 */}
          <path d="M11.5 16c-.8 2-.8 4.3 0 6.2 1-.5 1.6-1.4 1.7-2.6-.9-1-1.4-2.2-1.7-3.6z" fill="#241a12" />
          <path d="M28.5 16c.8 2 .8 4.3 0 6.2-1-.5-1.6-1.4-1.7-2.6.9-1 1.4-2.2 1.7-3.6z" fill="#241a12" />
        </>
      }
    />
  );
}

function CsAvatar() {
  return (
    <Face
      bg="#6D28D9"
      hair={
        <>
          <path d="M11.5 15.5c0-5.2 3.8-8.8 8.5-8.8s8.5 3.6 8.5 8.8c-1.3-1.7-3.2-2.7-5.6-2.9.4.6.5 1.2.3 1.8-1.8-1.6-4.1-2.1-6.4-1.4.3.6.3 1.1.1 1.7-1.7-.4-3.4.2-5.4 2.8z" fill="#2a2018" />
          {/* 헤드셋 */}
          <path d="M10.5 17.5a9.5 9.5 0 0119 0" stroke="#111827" strokeWidth="1.4" fill="none" />
          <rect x="9" y="17" width="2.6" height="4.2" rx="1.3" fill="#111827" />
          <rect x="28.4" y="17" width="2.6" height="4.2" rx="1.3" fill="#111827" />
          <path d="M29.5 21.2v1.8c0 1-1 1.8-2.3 1.8h-1" stroke="#111827" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </>
      }
    />
  );
}

const AVATARS: Record<string, () => React.ReactElement> = {
  strategy: StrategyAvatar,
  product: ProductAvatar,
  growth: GrowthAvatar,
  cs: CsAvatar,
};

export function AgentAvatar({ agent, size = 28 }: { agent: string; size?: number }) {
  const Comp = AVATARS[agent];
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {Comp ? <Comp /> : <span className="block h-full w-full bg-gray-300" />}
    </span>
  );
}
