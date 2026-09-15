-- Synchronize an accepted provisioning Owner invitation with Platform onboarding.
-- The trigger runs after InvitationService has created the user + membership and
-- marked the invitation accepted, so Platform readiness can be derived from the
-- authoritative tenant identity state instead of a manual checklist toggle.

CREATE OR REPLACE FUNCTION sync_platform_owner_acceptance_to_onboarding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  accepted_owner_user_id TEXT;
  onboarding_id_value TEXT;
  remaining_required BIGINT;
  blocked_items BIGINT;
BEGIN
  IF NEW."acceptedAt" IS NULL OR OLD."acceptedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT u.id
  INTO accepted_owner_user_id
  FROM users u
  JOIN memberships m
    ON m."userId" = u.id
   AND m."tenantId" = NEW."tenantId"
   AND m."companyId" = NEW."companyId"
   AND m.status = 'ACTIVE'
  JOIN roles r
    ON r.id = m."roleId"
   AND r."tenantId" = NEW."tenantId"
   AND r."companyId" = NEW."companyId"
   AND r.slug = 'owner'
   AND r.scope = 'CENTRAL'
  WHERE lower(u.email) = lower(NEW.email)
    AND r.id = NEW."roleId"
  LIMIT 1;

  IF accepted_owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO onboarding_id_value
  FROM platform_tenant_onboarding
  WHERE tenant_id = NEW."tenantId"
  FOR UPDATE;

  IF onboarding_id_value IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE platform_tenant_onboarding
  SET owner_user_id = accepted_owner_user_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = onboarding_id_value;

  UPDATE platform_tenant_onboarding_items
  SET status = 'COMPLETED',
      completed_by_user_id = accepted_owner_user_id,
      completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
      notes = COALESCE(notes, 'Automatically completed after the primary Owner accepted the provisioning invitation.'),
      updated_at = CURRENT_TIMESTAMP
  WHERE onboarding_id = onboarding_id_value
    AND item_key = 'OWNER_ACCESS';

  SELECT
    COUNT(*) FILTER (WHERE required = TRUE AND status <> 'COMPLETED')::bigint,
    COUNT(*) FILTER (WHERE status = 'BLOCKED')::bigint
  INTO remaining_required, blocked_items
  FROM platform_tenant_onboarding_items
  WHERE onboarding_id = onboarding_id_value;

  UPDATE platform_tenant_onboarding
  SET status = CASE
        WHEN status = 'COMPLETED' THEN status
        WHEN blocked_items > 0 THEN 'BLOCKED'
        WHEN remaining_required = 0 THEN 'READY_FOR_GO_LIVE'
        ELSE 'IN_PROGRESS'
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = onboarding_id_value;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_invitation_platform_owner_acceptance_sync
  ON user_invitations;
CREATE TRIGGER user_invitation_platform_owner_acceptance_sync
AFTER UPDATE OF "acceptedAt" ON user_invitations
FOR EACH ROW
WHEN (NEW."acceptedAt" IS NOT NULL AND OLD."acceptedAt" IS NULL)
EXECUTE FUNCTION sync_platform_owner_acceptance_to_onboarding();
