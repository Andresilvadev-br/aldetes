-- Aldetes 2.1 Identity Studio: banner options, profile theme and decorations. Nullable only; rollback in down.sql.
ALTER TABLE "User" ADD COLUMN     "bannerOptions" JSONB,
ADD COLUMN     "profileTheme" TEXT,
ADD COLUMN     "profileDecor" JSONB;
