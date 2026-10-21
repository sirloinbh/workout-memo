-- #88: biceps (이두) and triceps (삼두) are body parts; 팔 stays valid for mappings saved
-- before. Literals use ASCII Unicode escapes like 007 so a non-UTF-8 console pipe cannot
-- corrupt them. In order: chest, back, shoulders, arms (legacy), biceps, triceps,
-- legs-front, legs-back, abs. Safe to re-run: the check is replaced as a whole.
ALTER TABLE exercise_body_parts DROP CONSTRAINT IF EXISTS exercise_body_parts_body_part_check;
ALTER TABLE exercise_body_parts ADD CONSTRAINT exercise_body_parts_body_part_check CHECK (
  body_part IN (U&'\AC00\C2B4', U&'\B4F1', U&'\C5B4\AE68', U&'\D314', U&'\C774\B450', U&'\C0BC\B450',
    U&'\D558\CCB4-\C55E', U&'\D558\CCB4-\B4A4', U&'\BCF5\ADFC')
);