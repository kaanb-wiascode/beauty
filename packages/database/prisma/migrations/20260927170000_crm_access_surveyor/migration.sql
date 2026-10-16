-- CRM erişim kapsamı, satış ekipleri ve anketör bağlantısı
CREATE TABLE IF NOT EXISTS crm_access_policies (
  role_id TEXT PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  data_scope TEXT NOT NULL CHECK (data_scope IN ('SELF','TEAM','BRANCH','COMPANY','ALL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_teams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  name TEXT NOT NULL,
  manager_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_teams_scope_idx
  ON crm_teams(tenant_id, company_id, branch_id, active);

CREATE TABLE IF NOT EXISTS crm_team_members (
  team_id TEXT NOT NULL REFERENCES crm_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS crm_team_members_user_idx ON crm_team_members(user_id);

CREATE TABLE IF NOT EXISTS crm_surveyor_profiles (
  staff_id TEXT PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  daily_desk_quota INTEGER,
  weekly_desk_quota INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (daily_desk_quota IS NULL OR daily_desk_quota >= 0),
  CHECK (weekly_desk_quota IS NULL OR weekly_desk_quota >= 0)
);

CREATE INDEX IF NOT EXISTS crm_surveyor_profiles_scope_idx
  ON crm_surveyor_profiles(tenant_id, company_id, branch_id, active);

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS surveyor_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS surveyor_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS survey_campaign TEXT,
  ADD COLUMN IF NOT EXISTS survey_location TEXT,
  ADD COLUMN IF NOT EXISTS survey_desk TEXT,
  ADD COLUMN IF NOT EXISTS survey_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_leads_surveyor_idx
  ON crm_leads(tenant_id, company_id, branch_id, surveyor_staff_id)
  WHERE surveyor_staff_id IS NOT NULL;
