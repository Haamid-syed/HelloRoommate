-- Migration: arch_fixes
-- Change 4: Replace 3-column interest unique with a 2-column partial index
--            (only one PENDING or ACCEPTED interest per tenant+listing pair)
-- Change 2: Make compatibility_scores.explanation nullable,
--            add explanation metadata columns

-- ============================================================
-- Change 4 — Interest partial unique index
-- ============================================================

-- Drop the old 3-column unique constraint (Prisma-generated name)
DROP INDEX IF EXISTS "interests_tenant_profile_id_listing_id_status_key";

-- Partial unique: one PENDING or ACCEPTED interest per (tenant, listing)
-- DECLINED and WITHDRAWN do NOT block a new interest for the same pair.
CREATE UNIQUE INDEX uniq_active_interest
  ON interests (tenant_profile_id, listing_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

-- ============================================================
-- Change 2 — Lazy explanation columns on compatibility_scores
-- ============================================================

-- Make explanation nullable (was NOT NULL; existing rows get null)
ALTER TABLE compatibility_scores
  ALTER COLUMN explanation DROP NOT NULL;

-- Backfill existing rows: set explanation to empty string so they aren't
-- accidentally re-fetched as "no explanation" — they'll be regenerated on
-- first detail-view access via the new lazy generation path.
UPDATE compatibility_scores SET explanation = '' WHERE explanation IS NULL;

-- Add explanation metadata columns
ALTER TABLE compatibility_scores
  ADD COLUMN IF NOT EXISTS explanation_source TEXT,
  ADD COLUMN IF NOT EXISTS explanation_version TEXT,
  ADD COLUMN IF NOT EXISTS explanation_at TIMESTAMPTZ;

-- Backfill: existing FALLBACK-sourced rows with an explanation get TEMPLATED label
UPDATE compatibility_scores
  SET explanation_source = 'TEMPLATED',
      explanation_version = 'v0',
      explanation_at = computed_at
  WHERE explanation IS NOT NULL AND explanation != '' AND explanation_source IS NULL;
