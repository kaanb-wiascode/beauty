CREATE OR REPLACE FUNCTION enforce_operations_resource_block_on_allocation()
RETURNS TRIGGER AS $$
DECLARE
  conflicting_block RECORD;
BEGIN
  IF NEW.status = 'RESERVED' AND NEW.room_id IS NOT NULL THEN
    SELECT id, reason, blocked_from, blocked_to
      INTO conflicting_block
    FROM operations_resource_blocks
    WHERE room_id = NEW.room_id
      AND tenant_id = NEW.tenant_id
      AND company_id = NEW.company_id
      AND branch_id = NEW.branch_id
      AND status = 'ACTIVE'
      AND blocked_from < NEW.blocked_to
      AND blocked_to > NEW.blocked_from
    ORDER BY blocked_from ASC
    LIMIT 1;
  ELSIF NEW.status = 'RESERVED' AND NEW.inventory_asset_id IS NOT NULL THEN
    SELECT id, reason, blocked_from, blocked_to
      INTO conflicting_block
    FROM operations_resource_blocks
    WHERE inventory_asset_id = NEW.inventory_asset_id
      AND tenant_id = NEW.tenant_id
      AND company_id = NEW.company_id
      AND branch_id = NEW.branch_id
      AND status = 'ACTIVE'
      AND blocked_from < NEW.blocked_to
      AND blocked_to > NEW.blocked_from
    ORDER BY blocked_from ASC
    LIMIT 1;
  END IF;

  IF conflicting_block.id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = format(
        'RESOURCE_UNAVAILABLE_BLOCK: block=%s reason=%s from=%s to=%s',
        conflicting_block.id,
        conflicting_block.reason,
        conflicting_block.blocked_from,
        conflicting_block.blocked_to
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operations_resource_block_allocation
  ON operations_resource_allocations;
CREATE TRIGGER trg_operations_resource_block_allocation
BEFORE INSERT OR UPDATE OF status, blocked_from, blocked_to, room_id, inventory_asset_id
ON operations_resource_allocations
FOR EACH ROW
EXECUTE FUNCTION enforce_operations_resource_block_on_allocation();
