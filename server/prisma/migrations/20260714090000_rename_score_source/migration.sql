-- Migration: rename_score_source_enum
-- Fix 3: Rename ScoreSource enum values:
--   - Remove dead 'LLM' value (nothing writes LLM to score source anymore)
--   - Rename 'FALLBACK' to 'RULE_BASED' (more accurate: always rule-based/deterministic)
--
-- Also renames the enum type itself from score_source to score_source_new (Postgres pattern).

-- Step 1: Create new enum with only RULE_BASED
CREATE TYPE "ScoreSource_new" AS ENUM ('RULE_BASED');

-- Step 2: Migrate existing data
--   FALLBACK rows → RULE_BASED
--   LLM rows → RULE_BASED (seed data used LLM; live system never wrote LLM scores)
ALTER TABLE compatibility_scores
  ALTER COLUMN source TYPE "ScoreSource_new"
  USING (
    CASE source::text
      WHEN 'FALLBACK' THEN 'RULE_BASED'::"ScoreSource_new"
      WHEN 'LLM'      THEN 'RULE_BASED'::"ScoreSource_new"
      ELSE 'RULE_BASED'::"ScoreSource_new"
    END
  );

-- Step 3: Drop the old enum and rename the new one
DROP TYPE "ScoreSource";
ALTER TYPE "ScoreSource_new" RENAME TO "ScoreSource";
