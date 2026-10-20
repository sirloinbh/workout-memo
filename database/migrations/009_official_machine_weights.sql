-- Manufacturer-published starting resistance (no plates) kept apart from user machine data.
-- Seeding never touches machines.base_weight or sets.weight, so past workout totals stay fixed.
-- Research method, sources and limits: docs/machine-official-weights.md. Safe to re-run.
CREATE TABLE IF NOT EXISTS official_machine_weights (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand text NOT NULL,
  lineup text NOT NULL,
  model_number text NOT NULL DEFAULT '',
  model_name text NOT NULL,
  official_item_name text NOT NULL,
  setting text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('verified', 'unverified', 'conflict')),
  raw_value numeric(8,2) CHECK (raw_value >= 0),
  raw_unit text CHECK (raw_unit IN ('lb', 'kg')),
  official_kg_text text,
  weight_kg numeric(7,2) CHECK (weight_kg >= 0),
  basis text CHECK (basis IN ('per_arm', 'combined', 'unspecified')),
  source_url text CHECK (source_url ~ '^https://'),
  checked_date date NOT NULL,
  notes text NOT NULL DEFAULT '',
  UNIQUE (brand, lineup, model_name, setting),
  -- A published value always carries its unit, kg conversion, basis and official source.
  CHECK (status = 'unverified' OR (raw_value IS NOT NULL AND raw_unit IS NOT NULL
    AND weight_kg IS NOT NULL AND basis IS NOT NULL AND source_url IS NOT NULL)),
  -- Unverified is NULL (never 0) and must say why.
  CHECK (status <> 'unverified' OR (raw_value IS NULL AND raw_unit IS NULL
    AND weight_kg IS NULL AND length(btrim(notes)) > 0)),
  CHECK (status <> 'conflict' OR length(btrim(notes)) > 0)
);
-- Newtech machines can be registered; the name matches official_machine_weights.brand.
INSERT INTO brands(name) VALUES ('Newtech') ON CONFLICT (name) DO NOTHING;
-- Optional user-chosen link; deleting a reference row only clears the link.
ALTER TABLE machines ADD COLUMN IF NOT EXISTS official_weight_id integer
  REFERENCES official_machine_weights(id) ON DELETE SET NULL;
-- kg = lb * 0.45359237 rounded to 2 decimals; official_kg_text keeps the manufacturer's kg text.
INSERT INTO official_machine_weights (brand, lineup, model_number, model_name, official_item_name,
  setting, status, raw_value, raw_unit, official_kg_text, weight_kg, basis, source_url, checked_date, notes)
VALUES
-- seed:begin
  ('Hammer Strength', 'Plate-Loaded', 'IL-BP', 'Iso-Lateral Bench Press', 'Starting Resistance (per arm)', '', 'verified', 7, 'lb', '3.2 kg', 3.18, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-bench-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-IP', 'Iso-Lateral Incline Press', 'Starting Resistance (per arm)', '', 'verified', 8, 'lb', '3.6 kg', 3.63, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-incline-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-SP', 'Iso-Lateral Shoulder Press', 'Starting Resistance (per arm)', '', 'verified', 10, 'lb', '4.5 kg', 4.54, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-shoulder-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-ROW', 'Iso-Lateral Row', 'Starting Resistance (per workarm)', '', 'verified', 12, 'lb', '5.4 kg', 5.44, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-row', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-PD', 'Iso-Lateral Front Lat Pulldown', 'Starting Resistance (per arm)', '', 'verified', 1, 'lb', '0.5 kg', 0.45, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-front-lat-pulldown', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-HR', 'Iso-Lateral High Row', 'Starting Resistance (per arm)', '', 'verified', 2, 'lb', '0.9 kg', 0.91, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-high-row', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-LR', 'Iso-Lateral Low Row', 'Starting Resistance (per arm)', '', 'verified', 8, 'lb', '3.6 kg', 3.63, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-low-row', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'HSLLP', 'Plate Loaded Linear Leg Press', 'Starting Resistance', '', 'verified', 118, 'lb', '53 kg', 53.52, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-linear-leg-press', DATE '2026-10-19', '공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', 'PL-HSQ2', 'Plate Loaded Hack Squat', 'Starting Resistance (per arm)', '', 'verified', 125, 'lb', '57 kg', 56.70, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hack-squat', DATE '2026-10-19', '공식 표기 그대로 per arm. 단일 슬레드 구조에서 편측 표기의 의미는 제조사 확인이 필요하다.'),
  ('Hammer Strength', 'Plate-Loaded', 'HSSMV', 'Plate-Loaded Vertical Smith Machine', 'Starting Resistance', '', 'verified', 30, 'lb', '13.6 kg', 13.61, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-vertical-smith-machine', DATE '2026-10-19', '공식 표기에 편측/합계 기준이 없다. 제품 중량 583 lb는 사용하지 않았다.'),
  ('Hammer Strength', 'Plate-Loaded', 'PL-BI', 'Plate Loaded Seated Biceps', 'Starting Resistance', '', 'conflict', 4, 'lb', '2 kg', 1.81, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-seated-biceps', DATE '2026-10-19', 'en-us 페이지는 기준 표기 없이 4 lbs (2 kg)이다. 검색 결과 요약상 en-eu 페이지는 4 lbs (1.8 kg) per workarm으로 보여 기준과 kg 표기가 다를 수 있다. en-eu 페이지를 직접 조회하지 않았으므로 임의로 해소하지 않았다.'),
  ('Hammer Strength', 'Plate-Loaded', 'IL-LC', 'Iso-Lateral Leg Curl', 'Starting Resistance (per arm)', '', 'verified', 2, 'lb', '0.9 kg', 0.91, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-leg-curl', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-LE', 'Iso-Lateral Leg Extension', 'Starting Resistance (per arm)', '', 'verified', 4, 'lb', '1.8 kg', 1.81, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/iso-lateral-leg-extension', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-WC', 'Iso-Lateral Wide Chest', 'Starting Resistance', '', 'verified', 2, 'lb', '0.9 kg', 0.91, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-wide-chest', DATE '2026-10-19', '시작 저항 항목에는 기준이 없고 최대 적재 항목만 per arm으로 표기되어 있다.'),
  ('Hammer Strength', 'Plate-Loaded', 'IL-WPD', 'Iso-Lateral Wide Pulldown', 'Starting Resistance (per arm)', '', 'verified', 2, 'lb', '0.9 kg', 0.91, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-wide-pulldown', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-FMP', 'Iso-Lateral Super Incline Press', 'Starting Resistance (per arm)', '', 'verified', 11, 'lb', '5 kg', 4.99, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-super-incline-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-DCP', 'Iso-Lateral Decline Chest Press', 'Starting Resistance (per arm)', '', 'verified', 6, 'lb', '3 kg', 2.72, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/iso-lateral-decline-chest-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-DRW', 'Iso-Lateral D.Y. Row', 'Starting Resistance (per arm)', '', 'verified', 3, 'lb', '1.4 kg', 1.36, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-d-y-row', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-HBP', 'Iso-Lateral Horizontal Bench Press', 'Starting Resistance (per arm)', '', 'verified', 18, 'lb', '8.2 kg', 8.16, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-horizontal-bench-press', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'IL-TBR', 'Iso-Lateral T-Bar Row', 'Starting Resistance (per arm)', '', 'verified', 23, 'lb', '10 kg', 10.43, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/iso-lateral-t-bar-row', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'PL-XSQ', 'Plate Loaded Pendulum-X Squat', 'Starting Resistance (per arm)', '', 'verified', 81, 'lb', '37 kg', 36.74, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/pendulum-x-squat', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'PL-CALF', 'Plate Loaded Seated Calf Raise', 'Starting Resistance', '', 'verified', 60, 'lb', '27 kg', 27.22, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-seated-calf-raise', DATE '2026-10-19', '공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', 'IL-KLC', 'Iso-Lateral Kneeling Leg Curl', 'Starting Resistance', '', 'verified', 8, 'lb', '3.6 kg', 3.63, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-kneeling-leg-curl', DATE '2026-10-19', '값 옆에 per work-arm으로 표기되어 있다.'),
  ('Hammer Strength', 'Plate-Loaded', 'IL-CB', 'Iso-Lateral Chest / Back', 'Starting Resistance (per arm)', '', 'verified', 7, 'lb', '3 kg', 3.18, 'per_arm', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-chest-back', DATE '2026-10-19', ''),
  ('Hammer Strength', 'Plate-Loaded', 'PL-BSQ', 'Plate Loaded Belt Squat', 'Starting Resistance', 'Anchor 1 (closest to pivot point)', 'verified', 76, 'lb', '34 kg', 34.47, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-belt-squat', DATE '2026-10-19', '앵커 위치별 공식값. 공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', 'PL-BSQ', 'Plate Loaded Belt Squat', 'Starting Resistance', 'Anchor 2', 'verified', 71, 'lb', '32 kg', 32.21, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-belt-squat', DATE '2026-10-19', '앵커 위치별 공식값. 공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', 'PL-BSQ', 'Plate Loaded Belt Squat', 'Starting Resistance', 'Anchor 3', 'verified', 66, 'lb', '30 kg', 29.94, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-belt-squat', DATE '2026-10-19', '앵커 위치별 공식값. 공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', 'PL-BSQ', 'Plate Loaded Belt Squat', 'Starting Resistance', 'Anchor 4 (furthest from pivot point)', 'verified', 62, 'lb', '28 kg', 28.12, 'unspecified', 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-belt-squat', DATE '2026-10-19', '앵커 위치별 공식값. 공식 표기에 편측/합계 기준이 없다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Reverse V-Squat', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/reverse-v-squat', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Super Squat Press', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/super-squat-press', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Super Fly', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/super-fly', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Assisted Nordic Ham', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/assisted-nordic-ham', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Tibia Dorsi-Flexion', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-tibia-dorsi-flexion', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Ground Base Squat / High Pull', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-squat-high-pull', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Seated / Standing Shrug', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-seated-standing-shrug', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Seated Dip', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-seated-dip', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Pullover', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-pullover', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Lateral Raise', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-lateral-raise', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Gripper', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-gripper', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Abdominal / Oblique Crunch', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-abdominal-oblique-crunch', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'T-Bar Row', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-t-bar-row', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded Glute Drive', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-glute-drive', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Plate Loaded 4-Way Neck', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/4-way-neck', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Hammer Strength', 'Plate-Loaded', '', 'Glute Ham / Reverse Hyper', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/glute-ham-reverse-hyper-combo', DATE '2026-10-19', '공식 카탈로그 목록에서 모델을 확인했으나 조사 상한으로 제품 페이지를 조회하지 않았다. 판매처 값은 공식값으로 쓰지 않는다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Multi-Flex', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded ISO Lat Pulldown', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Incline Fly', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Vertical Row', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Vertical Chest Press', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded ISO Flat Press', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded ISO Converging Shoulder Press', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Viking Press', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Glute Bridge', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded T-Bar Row', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Arsenal Strength', 'Reloaded', '', 'Reloaded Posterior Chain Developer', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '제조사 공식 제품 페이지·카탈로그를 찾지 못했다(arsenalstrength.com은 2026-10-19 조회 시 무관한 체육관 사이트). 모델명과 수치는 판매처(Performaxx) 목록에만 있어 공식값으로 채택하지 않았다.'),
  ('Newtech', '온힘', '', '온힘 라인업 (모델 미확인)', 'Starting Resistance', '', 'unverified', NULL, NULL, NULL, NULL, NULL, NULL, DATE '2026-10-19', '공식 사이트 ntws.co.kr가 2026-10-19 자동 조회에 403을 반환했다. 공개 검색에서는 M Torture·Advance 라인만 확인되어 온힘 라인업과 모델 목록을 공식 자료로 확인하지 못했다.')
-- seed:end
ON CONFLICT (brand, lineup, model_name, setting) DO UPDATE SET
  model_number = EXCLUDED.model_number,
  official_item_name = EXCLUDED.official_item_name,
  status = EXCLUDED.status,
  raw_value = EXCLUDED.raw_value,
  raw_unit = EXCLUDED.raw_unit,
  official_kg_text = EXCLUDED.official_kg_text,
  weight_kg = EXCLUDED.weight_kg,
  basis = EXCLUDED.basis,
  source_url = EXCLUDED.source_url,
  checked_date = EXCLUDED.checked_date,
  notes = EXCLUDED.notes;
