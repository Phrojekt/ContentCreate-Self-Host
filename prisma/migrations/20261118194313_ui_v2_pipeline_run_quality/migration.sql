-- CreateEnum
CREATE TYPE "PipelineTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'FAILED', 'SKIPPED');

-- (DROP INDEX "MemoryEntry_embedding_hnsw_idx" gerado pelo Prisma removido —
-- o índice HNSW do pgvector é mantido; ver nota na migration ui_v2_draft_decisions.)

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "pipelineRunId" TEXT,
ADD COLUMN     "qualityReport" TEXT,
ADD COLUMN     "qualityScore" INTEGER;

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "trigger" "PipelineTrigger" NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "collected" INTEGER NOT NULL DEFAULT 0,
    "afterDedup" INTEGER NOT NULL DEFAULT 0,
    "afterFilter" INTEGER NOT NULL DEFAULT 0,
    "afterAlreadyProcessed" INTEGER NOT NULL DEFAULT 0,
    "afterSemantic" INTEGER NOT NULL DEFAULT 0,
    "selected" INTEGER NOT NULL DEFAULT 0,
    "skippedThinContent" INTEGER NOT NULL DEFAULT 0,
    "draftsCreated" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',
    "failure" TEXT,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineRun_startedAt_idx" ON "PipelineRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
