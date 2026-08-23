import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">SOMUN AI HQ</h1>
          <p className="mt-2 text-sm text-gray-500">
            소문다이렉트 AI 조직형 업무·전략 협업 채팅
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1496F4] px-4 py-3 text-sm font-medium text-white transition hover:brightness-95"
          >
            Google 계정으로 로그인
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-400">
          허용된 계정만 접속할 수 있는 내부 전용 서비스입니다.
        </p>
      </div>
    </div>
  );
}
