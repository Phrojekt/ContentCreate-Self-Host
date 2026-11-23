-- Habilita a extensão pgvector (imagem Docker `pgvector/pgvector:pg17` já a
-- traz instalada; este CREATE EXTENSION garante que qualquer banco que rode
-- esta migration — incluindo o shadow DB do `prisma migrate dev` — a tenha).
CREATE EXTENSION IF NOT EXISTS vector;

-- Troca `embedding` de TEXT (JSON, DEC-018) para vector(768) nativo (DEC-021).
-- Tabela vazia nesta migração (nenhum dado de produção a preservar) — DROP +
-- ADD em vez de um ALTER COLUMN com cast (não há conversão automática de JSON
-- de texto para vector).
ALTER TABLE "MemoryEntry" DROP COLUMN "embedding";
ALTER TABLE "MemoryEntry" ADD COLUMN "embedding" vector(768) NOT NULL;

-- Índice aproximado por similaridade de cosseno. Não crítico no volume atual
-- (dezenas/centenas de linhas — sequential scan já é rápido), mas deixa o
-- projeto pronto para crescer sem precisar de nova migration.
CREATE INDEX "MemoryEntry_embedding_hnsw_idx" ON "MemoryEntry" USING hnsw ("embedding" vector_cosine_ops);
