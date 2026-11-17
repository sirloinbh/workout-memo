-- #260: Web Push for the rest timer. Safe to re-run.
-- user_id is the shared sign-in user id (#303); 'local' when the API runs without sign-in.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY CHECK (endpoint <> '' AND length(endpoint) <= 2048),
  user_id text NOT NULL CHECK (user_id <> '' AND length(user_id) <= 200),
  p256dh text NOT NULL CHECK (p256dh <> '' AND length(p256dh) <= 200),
  auth text NOT NULL CHECK (auth <> '' AND length(auth) <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);

-- One pending rest-end push per user: starting a new rest replaces it, cancel and pause delete it.
-- The row is deleted when the push is claimed, so a push is sent at most once.
CREATE TABLE IF NOT EXISTS rest_pushes (
  user_id text PRIMARY KEY CHECK (user_id <> '' AND length(user_id) <= 200),
  ends_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rest_pushes_ends_at_idx ON rest_pushes (ends_at);
