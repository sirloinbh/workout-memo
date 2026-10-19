-- A plan is an atomic document. JSON arrays preserve body-part order and repeats.
CREATE TABLE IF NOT EXISTS routines (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
