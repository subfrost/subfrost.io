-- Rollout migration for the IAM re-key (Privilege enum → dotted string codes).
-- Run order at deploy (prod, via the Cloud SQL Auth Proxy), BEFORE the new image
-- serves traffic:
--
--   1. psql -f scripts/migrate-privileges-columns.sql      (this file: enum[] → text[])
--   2. tsx scripts/backfill-granular-privileges.ts          (maps FUEL_VIEW → fuel.read, …)
--   3. psql -c 'DROP TYPE IF EXISTS "Privilege";'           (after both columns converted)
--
-- Steps 1 and 2 are safe to run slightly ahead of the deploy: the columns keep
-- their string values, and old code reading text[] of the legacy codes still
-- works. Step 3 only after the new code (which no longer references the enum) is
-- live. All steps are idempotent.

BEGIN;

ALTER TABLE "User"
  ALTER COLUMN "privileges" DROP DEFAULT,
  ALTER COLUMN "privileges" TYPE text[] USING "privileges"::text[],
  ALTER COLUMN "privileges" SET DEFAULT '{}';

ALTER TABLE "ApiKey"
  ALTER COLUMN "scopes" DROP DEFAULT,
  ALTER COLUMN "scopes" TYPE text[] USING "scopes"::text[],
  ALTER COLUMN "scopes" SET DEFAULT '{}';

COMMIT;

-- After backfill (step 2) has normalized all rows to dotted codes, drop the enum:
--   DROP TYPE IF EXISTS "Privilege";
