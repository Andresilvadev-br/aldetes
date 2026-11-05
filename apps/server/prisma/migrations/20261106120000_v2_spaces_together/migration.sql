-- Aldetes 2.0: Spaces (each person's corner) and Together sessions. Additive only; rollback in down.sql.
ALTER TABLE "User" ADD COLUMN     "spaceScene" JSONB,
ADD COLUMN     "spaceRev" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TogetherSession" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "keep" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "TogetherSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TogetherSession_channelId_idx" ON "TogetherSession"("channelId");
ALTER TABLE "TogetherSession" ADD CONSTRAINT "TogetherSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
