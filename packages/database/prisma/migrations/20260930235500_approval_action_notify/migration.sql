ALTER TABLE approval_request_actions
  DROP CONSTRAINT IF EXISTS approval_request_actions_action_check;

ALTER TABLE approval_request_actions
  ADD CONSTRAINT approval_request_actions_action_check
  CHECK (
    action IN (
      'SUBMIT',
      'APPROVE',
      'REJECT',
      'RETURN',
      'RESUBMIT',
      'DELEGATE',
      'ESCALATE',
      'NOTIFY',
      'AUTO_APPROVE',
      'AUTO_REJECT',
      'CANCEL'
    )
  );
