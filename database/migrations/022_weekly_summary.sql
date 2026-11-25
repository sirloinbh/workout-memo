-- #485: the weekly summary push. Safe to re-run.
-- One row per user who has touched the setting. `enabled` is off until the user turns it on.
-- last_sent_week is the Monday of the last week whose summary was claimed, so a week is sent at most once,
-- even across a server restart.
CREATE TABLE IF NOT EXISTS weekly_summary_settings (
  user_id text PRIMARY KEY CHECK (user_id <> '' AND length(user_id) <= 200),
  enabled boolean NOT NULL DEFAULT false,
  last_sent_week date
);
