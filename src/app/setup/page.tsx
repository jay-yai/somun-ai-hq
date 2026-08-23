export default function SetupPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
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
    </div>
  );
}
