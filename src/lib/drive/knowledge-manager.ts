import { getDriveClient, isDriveConfigured } from "./client";
import type { DriveContextDoc } from "@/lib/agents/types";

const ROOT_FOLDER_ID = () => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string;

// 회사 자료 폴더 이름 (섹션 9) — 실제 폴더명이 다르면 여기만 수정하면 된다.
const KNOWN_SUBFOLDERS = [
  "01_STRATEGY",
  "02_PRODUCT",
  "03_GROWTH",
  "04_OPERATIONS",
  "05_AGENT_SETUP",
  "06_CS",
];
const AI_WORK_FOLDER = "07_AI_WORK";
const AI_WORK_SUBFOLDERS = {
  IN_PROGRESS: "01_IN_PROGRESS",
  APPROVED: "02_APPROVED",
  HOLD: "03_HOLD",
  HANDOFF: "04_HANDOFF",
  ARCHIVE: "05_ARCHIVE",
} as const;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

const MAX_DOC_CHARS = 2500; // 문서 하나당 Context로 넣는 최대 길이 (비용 절약)

// Google Drive가 아직 설정되지 않았을 때는 빈 결과를 반환해
// 나머지 기능(채팅, Agent 호출)은 정상 동작하도록 한다.
function requireDriveOrNull() {
  if (!isDriveConfigured()) return null;
  return getDriveClient();
}

async function listChildren(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string
): Promise<DriveFile[]> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, parents)",
    pageSize: 100,
  });
  return (res.data.files ?? []) as DriveFile[];
}

async function readFileText(
  drive: ReturnType<typeof getDriveClient>,
  file: DriveFile
): Promise<string> {
  try {
    if (file.mimeType === "application/vnd.google-apps.document") {
      const res = await drive.files.export(
        { fileId: file.id, mimeType: "text/plain" },
        { responseType: "text" }
      );
      return String(res.data ?? "");
    }
    if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
      const res = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "text" }
      );
      return String(res.data ?? "");
    }
    // docx, pdf 등은 MVP에서는 건너뛴다 (이름/메타데이터만 검색 대상으로 사용).
    return "";
  } catch {
    return "";
  }
}

// 최신 SOMUNDIRECT MASTER 문서를 찾아 읽는다 (섹션 4, 24).
export async function getMasterSummary(): Promise<string> {
  const drive = requireDriveOrNull();
  if (!drive) return "";

  const res = await drive.files.list({
    q: `'${ROOT_FOLDER_ID()}' in parents and name contains 'MASTER' and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 5,
  });
  const files = (res.data.files ?? []) as DriveFile[];
  if (files.length === 0) return "";

  const content = await readFileText(drive, files[0]);
  return content.slice(0, 4000);
}

// 업무 주제와 관련된 자료를 Drive에서 검색해 상위 N개만 Context로 반환한다 (섹션 11).
// Drive 전체를 프롬프트에 넣지 않고, 이름/내용 키워드 매칭으로 관련도 높은 것만 고른다.
export async function searchRelevantDocs(
  userRequest: string,
  limit = 5
): Promise<DriveContextDoc[]> {
  const drive = requireDriveOrNull();
  if (!drive) return [];

  const keywords = userRequest
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2);

  if (keywords.length === 0) return [];

  // 하위 폴더 목록 조회 (없는 폴더는 조용히 건너뜀)
  const rootChildren = await listChildren(drive, ROOT_FOLDER_ID());
  const targetFolders = rootChildren.filter((f) =>
    KNOWN_SUBFOLDERS.includes(f.name)
  );

  const candidates: { file: DriveFile; folderName: string; score: number }[] =
    [];

  for (const folder of targetFolders) {
    const files = await listChildren(drive, folder.id);
    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") continue;
      const score = keywords.reduce(
        (acc, kw) =>
          acc + (file.name.toLowerCase().includes(kw.toLowerCase()) ? 1 : 0),
        0
      );
      candidates.push({ file, folderName: folder.name, score });
    }
  }

  // 이름에 키워드가 없어도 최신 자료 몇 개는 후보로 남겨 완전히 0건이 되지 않게 한다.
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);

  const docs: DriveContextDoc[] = [];
  for (const c of top) {
    const content = await readFileText(drive, c.file);
    if (!content) continue;
    docs.push({
      id: c.file.id,
      name: c.file.name,
      path: `${c.folderName}/${c.file.name}`,
      content: content.slice(0, MAX_DOC_CHARS),
    });
  }
  return docs;
}

async function findOrCreateFolder(
  drive: ReturnType<typeof getDriveClient>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  const existing = (res.data.files ?? [])[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id as string;
}

async function ensureAiWorkSubfolder(
  drive: ReturnType<typeof getDriveClient>,
  subfolder: string
): Promise<string> {
  const aiWorkId = await findOrCreateFolder(
    drive,
    AI_WORK_FOLDER,
    ROOT_FOLDER_ID()
  );
  return findOrCreateFolder(drive, subfolder, aiWorkId);
}

function statusToSubfolder(status: string): string {
  switch (status) {
    case "APPROVED":
    case "BUILD":
    case "LIVE":
      return AI_WORK_SUBFOLDERS.APPROVED;
    case "HOLD":
    case "DROP":
      return AI_WORK_SUBFOLDERS.HOLD;
    default:
      return AI_WORK_SUBFOLDERS.IN_PROGRESS;
  }
}

// 업무 결과를 Google Drive에 저장한다 (섹션 13). 기존 파일이 있으면 새 버전 내용으로 갱신한다.
export async function saveTaskResult(params: {
  existingFileId?: string | null;
  title: string;
  status: string;
  content: string;
}): Promise<string | null> {
  const drive = requireDriveOrNull();
  if (!drive) return null;

  const folderId = await ensureAiWorkSubfolder(
    drive,
    statusToSubfolder(params.status)
  );

  if (params.existingFileId) {
    await drive.files.update({
      fileId: params.existingFileId,
      media: { mimeType: "text/plain", body: params.content },
    });
    // 상태가 바뀌었으면 폴더도 이동시킨다.
    const file = await drive.files.get({
      fileId: params.existingFileId,
      fields: "parents",
    });
    const prevParents = (file.data.parents ?? []).join(",");
    await drive.files.update({
      fileId: params.existingFileId,
      addParents: folderId,
      removeParents: prevParents,
    });
    return params.existingFileId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: params.title,
      parents: [folderId],
      mimeType: "application/vnd.google-apps.document",
    },
    media: { mimeType: "text/plain", body: params.content },
    fields: "id",
  });
  return (created.data.id as string) ?? null;
}
