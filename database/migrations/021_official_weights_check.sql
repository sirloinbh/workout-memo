-- #367: 013 corrects 28 rows of the official machine weights with UPDATEs that succeed silently when a row is missing.
-- This check fails the migration run when any of those rows is absent. It does not edit 009 or 013: an applied
-- migration file must stay byte-identical (its checksum is recorded), and both files run only through
-- `npm run db:migrate`, which applies each one once. Never run 009 by hand on a live database: its upsert writes
-- the pre-013 values back over the corrections.
DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*) INTO matched
  FROM official_machine_weights o
  JOIN (VALUES
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Reverse V-Squat', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Super Squat Press', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Super Fly', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Assisted Nordic Ham', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Tibia Dorsi-Flexion', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Ground Base Squat / High Pull', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Seated / Standing Shrug', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Seated Dip', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Pullover', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Lateral Raise', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Gripper', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Abdominal / Oblique Crunch', ''),
  ('Hammer Strength', 'Plate-Loaded', 'T-Bar Row', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded Glute Drive', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Plate Loaded 4-Way Neck', ''),
  ('Hammer Strength', 'Plate-Loaded', 'Glute Ham / Reverse Hyper', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Multi-Flex', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded ISO Lat Pulldown', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Incline Fly', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Vertical Row', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Vertical Chest Press', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded ISO Flat Press', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded ISO Converging Shoulder Press', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Viking Press', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Glute Bridge', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded T-Bar Row', ''),
  ('Arsenal Strength', 'Reloaded', 'Reloaded Posterior Chain Developer', ''),
  ('Newtech', '온힘', '온힘 라인업 (모델 미확인)', '')
  ) AS v(brand, lineup, model_name, setting)
    ON o.brand = v.brand AND o.lineup = v.lineup AND o.model_name = v.model_name AND o.setting = v.setting;
  IF matched <> 28 THEN
    RAISE EXCEPTION 'official_machine_weights: % of 28 rows corrected by 013 were found', matched;
  END IF;
END
$$;
