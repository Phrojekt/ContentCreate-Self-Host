// Barrel do módulo de memória de alinhamento (RAG — DEC-017/DEC-020/DEC-021).
export {
  buildRejectedLessonContent,
  deactivateRejectedLessons,
  listMemoryEntries,
  setMemoryEntryActive,
  recallMemory,
  recordApprovedExample,
  recordRejectedLesson,
  syncManualEpisodic,
  syncManualMemory,
} from "./memory-store";
export type {
  MemoryListFilter,
  MemoryListItem,
  RecalledMemory,
  RejectionInput,
} from "./memory-store";
