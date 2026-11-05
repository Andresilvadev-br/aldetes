-- Rollback of 20261106180000_identity_studio (manual), then delete its row from "_prisma_migrations".
ALTER TABLE "User" DROP COLUMN IF EXISTS "bannerOptions", DROP COLUMN IF EXISTS "profileTheme", DROP COLUMN IF EXISTS "profileDecor";
