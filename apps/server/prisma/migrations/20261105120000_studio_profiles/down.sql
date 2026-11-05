-- Rollback of 20261105120000_studio_profiles (run manually, then delete the row from _prisma_migrations):
--   docker compose exec -T db psql -U aldetes aldetes < down.sql
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261105120000_studio_profiles';
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarDecoration",
DROP COLUMN IF EXISTS "profileEntrance",
DROP COLUMN IF EXISTS "pronouns",
DROP COLUMN IF EXISTS "profileLinks";

ALTER TABLE "Server" DROP COLUMN IF EXISTS "studio",
DROP COLUMN IF EXISTS "studioDraft",
DROP COLUMN IF EXISTS "studioPrev";
