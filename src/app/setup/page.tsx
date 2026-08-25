export default function SetupPage() {
  return (
    <div className="mx-auto max-w-xl space-y-12 px-6 py-16">
      <section>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Google Drive 최초 연결
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          아래 버튼을 눌러 한 번만 Google 계정 인증을 진행하면, 이후로는 서버가
          자동으로 회사 Drive 자료를 읽고 저장할 수 있습니다.
        </p>
        <a
          href="/api/setup/google-drive/start"
          className="inline-flex items-center gap-2 rounded-lg bg-[#1496F4] px-5 py-3 text-sm font-medium text-white"
        >
          Google Drive 연결하기
        </a>
        <p className="mt-6 text-xs text-gray-400">
          진행 전에 .env.local에 GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET가
          먼저 설정되어 있어야 합니다.
        </p>
      </section>

      <section className="border-t border-gray-100 pt-12">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          네이버 블로그 최초 연결
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          연결해두면 Growth팀이 작성한 글을 검토 후 바로 네이버 블로그에
          게시할 수 있습니다.
        </p>
        <a
          href="/api/setup/naver-blog/start"
          className="inline-flex items-center gap-2 rounded-lg bg-[#03C75A] px-5 py-3 text-sm font-medium text-white"
        >
          네이버 블로그 연결하기
        </a>
        <p className="mt-6 text-xs text-gray-400">
          진행 전에 .env.local에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET가
          먼저 설정되어 있어야 하고, 네이버 개발자센터 앱에서 &quot;블로그&quot; API
          사용 설정이 되어 있어야 합니다.
        </p>
      </section>
    </div>
  );
}
