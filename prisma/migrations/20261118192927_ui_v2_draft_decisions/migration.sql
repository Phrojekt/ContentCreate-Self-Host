-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterForeignKey: MemoryEntry.draftId já é ON DELETE SET NULL desde a
-- migration init (default do Prisma para relação opcional); o schema agora
-- declara `onDelete: SetNull` explicitamente — nenhuma mudança de SQL.
--
-- NOTA: o Prisma não enxerga o índice HNSW de pgvector
-- ("MemoryEntry_embedding_hnsw_idx", criado via SQL puro) e gera um
-- DROP INDEX a cada `migrate dev`. Remova essa linha das migrations novas
-- (`migrate dev --create-only`, editar, depois `migrate dev`).
