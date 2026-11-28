-- #528: the rest timer and its rest-over push were removed. The pending rest-end pushes table is no longer
-- used. push_subscriptions stays: the weekly summary push (#485) still needs it. Safe to re-run.
DROP TABLE IF EXISTS rest_pushes;
