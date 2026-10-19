-- One optional-metric record per calendar date (Asia/Seoul service date).
-- Missing metrics stay NULL; no value is estimated. NUMERIC(5,2) keeps exactly
-- two decimals (kg, %), and the API rejects inputs with more precision.
CREATE TABLE IF NOT EXISTS body_measurements (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL UNIQUE,
  body_weight_kg numeric(5, 2) CHECK (body_weight_kg > 0),
  body_fat_percent numeric(5, 2) CHECK (body_fat_percent >= 0 AND body_fat_percent <= 100),
  skeletal_muscle_kg numeric(5, 2) CHECK (skeletal_muscle_kg > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT body_measurements_has_metric CHECK (
    body_weight_kg IS NOT NULL OR body_fat_percent IS NOT NULL OR skeletal_muscle_kg IS NOT NULL
  )
);
