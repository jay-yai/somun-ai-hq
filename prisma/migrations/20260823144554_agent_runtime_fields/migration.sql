-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "steps" INTEGER,
ADD COLUMN     "stepsLog" JSONB;
