CREATE TABLE IF NOT EXISTS crm_team_member_skills (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(team_id,user_id,skill_key),
  FOREIGN KEY(team_id,user_id) REFERENCES crm_team_members(team_id,user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS crm_team_member_skills_lookup_idx
  ON crm_team_member_skills(skill_key,user_id,team_id);
