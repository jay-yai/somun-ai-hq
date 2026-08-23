// ==================================================
// SHARED TOOL — KNOWLEDGE MANAGER
// ==================================================
// Agent는 Google Drive API나 DB를 직접 호출하지 않는다.
// 이 파일이 Knowledge Manager의 tool 인터페이스이며, 모든 Agent는
// 여기 정의된 tool만 통해서 회사 자료/과거 업무에 접근한다.
import {
  getMasterSummary,
  searchRelevantDocs,
  searchVoc,
  readDocument,
  searchPreviousWork,
} from "@/lib/drive/knowledge-manager";
import type { ToolExecutor, ToolSpec, KnowledgeManagerToolName } from "./types";
export type { KnowledgeManagerToolName };

const TOOL_SPECS: Record<KnowledgeManagerToolName, ToolSpec> = {
  get_master: {
    name: "get_master",
    description:
      "SOMUNDIRECT MASTER(회사 Single Source of Truth) 문서의 최신 내용을 가져온다. 이미 Context에 요약이 주어졌지만, 특정 조항을 다시 확인하고 싶을 때 호출한다.",
    parameters: { type: "object", properties: {} },
  },
  search_drive: {
    name: "search_drive",
    description:
      "회사 Google Drive(전략/프로덕트/그로스/운영/CS 자료)에서 주제와 관련된 문서를 검색한다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색할 주제나 키워드" },
      },
      required: ["query"],
    },
  },
  read_document: {
    name: "read_document",
    description: "search_drive 등으로 찾은 특정 문서 ID의 전체 내용을 읽는다.",
    parameters: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "Google Drive 파일 ID" },
      },
      required: ["file_id"],
    },
  },
  search_previous_work: {
    name: "search_previous_work",
    description:
      "이 회사에서 과거에 진행했던 유사한 업무와 그 결론을 검색한다 (이전 업무 이어하기).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "찾고 싶은 과거 업무 주제" },
      },
      required: ["query"],
    },
  },
  search_voc: {
    name: "search_voc",
    description: "고객 VOC/CS 관련 자료만 좁혀서 검색한다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색할 VOC/CS 주제" },
      },
      required: ["query"],
    },
  },
};

// userId(과거 업무 검색용)를 바인딩해 실제 실행 가능한 tool 목록을 만든다.
export function buildToolset(
  allowedTools: KnowledgeManagerToolName[],
  ctx: { userId: string }
): { specs: ToolSpec[]; executors: Record<string, ToolExecutor> } {
  const executors: Record<KnowledgeManagerToolName, ToolExecutor> = {
    get_master: async () => {
      const text = await getMasterSummary();
      return text || "(MASTER 문서를 찾지 못했습니다)";
    },
    search_drive: async (args) => {
      const docs = await searchRelevantDocs(String(args.query ?? ""));
      return docs.length > 0
        ? docs.map((d) => ({ file_id: d.id, path: d.path, excerpt: d.content.slice(0, 800) }))
        : "관련 문서를 찾지 못했습니다.";
    },
    read_document: async (args) => {
      const doc = await readDocument(String(args.file_id ?? ""));
      return doc ? { path: doc.path, content: doc.content } : "문서를 읽을 수 없습니다.";
    },
    search_previous_work: async (args) => {
      const results = await searchPreviousWork(ctx.userId, String(args.query ?? ""));
      return results.length > 0
        ? results
        : "관련된 과거 업무를 찾지 못했습니다.";
    },
    search_voc: async (args) => {
      const docs = await searchVoc(String(args.query ?? ""));
      return docs.length > 0
        ? docs.map((d) => ({ file_id: d.id, path: d.path, excerpt: d.content.slice(0, 800) }))
        : "관련 VOC 자료를 찾지 못했습니다.";
    },
  };

  const specs = allowedTools.map((name) => TOOL_SPECS[name]);
  const filteredExecutors: Record<string, ToolExecutor> = {};
  for (const name of allowedTools) {
    filteredExecutors[name] = executors[name];
  }
  return { specs, executors: filteredExecutors };
}
