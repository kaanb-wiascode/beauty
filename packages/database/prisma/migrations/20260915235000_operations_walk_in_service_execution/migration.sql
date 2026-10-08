ALTER TABLE operations_service_executions
  ALTER COLUMN appointment_id DROP NOT NULL;

ALTER TABLE operations_service_executions
  ADD COLUMN walk_in_commercial_context_id TEXT,
  ADD COLUMN sale_item_id TEXT;

ALTER TABLE operations_service_executions
  ADD CONSTRAINT operations_service_executions_walk_in_context_fkey
    FOREIGN KEY (walk_in_commercial_context_id)
    REFERENCES operations_walk_in_commercial_contexts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT operations_service_executions_sale_item_fkey
    FOREIGN KEY (sale_item_id)
    REFERENCES sale_items(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT operations_service_executions_source_check
    CHECK (
      (appointment_id IS NOT NULL AND walk_in_commercial_context_id IS NULL AND sale_item_id IS NULL)
      OR
      (appointment_id IS NULL AND walk_in_commercial_context_id IS NOT NULL AND sale_item_id IS NOT NULL)
    );

CREATE UNIQUE INDEX operations_service_executions_active_walk_in_sale_item_key
  ON operations_service_executions(walk_in_commercial_context_id, sale_item_id)
  WHERE status <> 'CANCELLED'::"ServiceExecutionStatus";

CREATE INDEX operations_service_executions_walk_in_context_idx
  ON operations_service_executions(tenant_id, branch_id, walk_in_commercial_context_id);
