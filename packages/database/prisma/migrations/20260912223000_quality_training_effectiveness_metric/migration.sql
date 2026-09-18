BEGIN;

ALTER TABLE quality_score_policy_dimensions
  DROP CONSTRAINT IF EXISTS quality_score_dimension_source_chk;

ALTER TABLE quality_score_policy_dimensions
  ADD CONSTRAINT quality_score_dimension_source_chk
  CHECK (source_kind IN (
    'INSPECTION_CATEGORY',
    'CUSTOMER_FEEDBACK',
    'TRAINING_COMPLIANCE',
    'TRAINING_EFFECTIVENESS',
    'CUSTOM_METRIC'
  )) NOT VALID;

COMMIT;
