-- Explicit user-managed exercise -> body part mapping (#32). Safe to re-run.
-- exercise stores the normalized identity lower(trim(name)) shared with goal judgment.
-- An exercise without rows is reported as an unclassified exercise; names are never
-- used to guess body parts.
-- Body part literals use ASCII Unicode escapes so piping this file through a console
-- with a non-UTF-8 code page cannot corrupt them. In order they are the seven #27
-- routine parts: chest, back, shoulders, arms, legs-front, legs-back, abs.
CREATE TABLE IF NOT EXISTS exercise_body_parts (
  exercise text NOT NULL CHECK (exercise <> '' AND length(exercise) <= 120),
  body_part text NOT NULL CHECK (
    body_part IN (U&'\AC00\C2B4', U&'\B4F1', U&'\C5B4\AE68', U&'\D314', U&'\D558\CCB4-\C55E', U&'\D558\CCB4-\B4A4', U&'\BCF5\ADFC')
  ),
  PRIMARY KEY (exercise, body_part)
);
