-- Rollback of 20261106120000_v2_spaces_together (manual), then:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261106120000_v2_spaces_together';
DROP TABLE IF EXISTS "TogetherSession";
ALTER TABLE "User" DROP COLUMN IF EXISTS "spaceScene", DROP COLUMN IF EXISTS "spaceRev";
