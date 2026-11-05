-- Aldetes 1.0: profile identity (decoration, entrance, pronouns, links) and Server Studio themes.
-- Only nullable columns: existing rows keep working, older clients simply ignore the new fields.
-- Rollback: see down.sql in this folder (drops exactly these columns).
ALTER TABLE "User" ADD COLUMN     "avatarDecoration" TEXT,
ADD COLUMN     "profileEntrance" TEXT,
ADD COLUMN     "pronouns" TEXT,
ADD COLUMN     "profileLinks" JSONB;

ALTER TABLE "Server" ADD COLUMN     "studio" JSONB,
ADD COLUMN     "studioDraft" JSONB,
ADD COLUMN     "studioPrev" JSONB;
