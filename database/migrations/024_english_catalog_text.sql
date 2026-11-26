-- #505: translate the Korean values that machine pages show (brand name, lineup, official-weight notes).
-- Rows are matched by id and only while they still contain Hangul, so a later edit is never overwritten.

UPDATE official_machine_weights SET notes = 'The official listing gives no per-arm or combined basis.'
WHERE id IN (8,22) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official listing says per arm as printed. What a per-side value means on a single-sled design needs the manufacturer''s confirmation.'
WHERE id IN (9) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The official listing gives no per-arm or combined basis. The 583 lb product weight was not used.'
WHERE id IN (10) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The en-us page lists 4 lbs (2 kg) with no basis. A search-result summary of the en-eu page shows 4 lbs (1.8 kg) per workarm, so the basis and kg value may differ. The en-eu page was not opened directly, so this was not resolved by assumption.'
WHERE id IN (11) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The starting resistance entry has no basis; only the maximum load entry is marked per arm.'
WHERE id IN (14) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Marked per work-arm next to the value.'
WHERE id IN (23) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official values per anchor position. The official listing gives no per-arm or combined basis.'
WHERE id IN (25,26,27,28) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-RVSQ).'
WHERE id IN (29) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-SSP).'
WHERE id IN (30) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-FLY).'
WHERE id IN (31) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The official page lists only ''Starting Assistance: 18 lb (8 kg)'', not a starting resistance. It is an assistance (reverse) load, so it is not treated as a starting resistance. Whether it is per arm or combined is not stated.'
WHERE id IN (32) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-TIB). The basis (per arm etc.) is not stated.'
WHERE id IN (33) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (GB-SHP).'
WHERE id IN (34) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-SH). Only the maximum load is marked per rod; the basis of the starting resistance is not stated.'
WHERE id IN (35) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-DIP); original text ''4 lbs (2 kg)''.'
WHERE id IN (36) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-PO); original text ''18 lbs (8.2 kg)''. The basis is not stated.'
WHERE id IN (37) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-LR).'
WHERE id IN (38) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-GRIP); original text ''14 lbs (6.3 kg)''.'
WHERE id IN (39) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Original text ''25 lb (11 kg) + 10% of user weight''. The fixed 25 lb has 10% of the user''s body weight added, so take care when applying it in the app. The basis is not stated (PL-AB).'
WHERE id IN (40) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The US and EU catalogs (PL-TBR-01) give no basis: ''40 lb (18 kg)''. The Life Fitness Australia site (https://www.lifefitness.com.au/commercial/t-bar-row-pl-tbr) says ''40 lbs (18 kg) per arm''. The numbers match and only the basis wording differs (per arm is doubtful on a single-bar design).'
WHERE id IN (41) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The US catalog (PL-GLD) gives no basis: ''45 lb (20 kg)''. The Australia site (https://www.lifefitness.com.au/commercial/glute-drive) says ''45 lbs (20 kg) per arm''. The EU page has no starting resistance entry. The numbers match and only the basis wording differs.'
WHERE id IN (42) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Confirmed in the Life Fitness US catalog spec table (PL-4W); original text ''2 lbs (0.9 kg)''. The basis is not stated.'
WHERE id IN (43) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The EU catalog (PL-GHRH) says ''Starting Resistance (per arm): 6.5 lb (3 kg)'', and the Australia site agrees with ''6.5 lbs (3 kg) per workarm''. The US catalog page could not be checked.'
WHERE id IN (44) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 25 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop).'
WHERE id IN (45) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 20 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. No official shop page, or not checked.'
WHERE id IN (46) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 10 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop).'
WHERE id IN (47,48,49) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 20 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop).'
WHERE id IN (50) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 18 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. No official shop page, or not checked.'
WHERE id IN (51) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 15 lb per arm'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop).'
WHERE id IN (52) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 60 lbs'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop). No per-arm or combined basis is stated.'
WHERE id IN (53) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 30 lbs'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. The same value is confirmed in the official shop (theshop). No per-arm or combined basis is stated.'
WHERE id IN (54) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'Official text ''Starting Weight: 45 lbs'' on the manufacturer''s product page (myarsenalstrength.com). No kg given. No official shop page, or not checked. No per-arm or combined basis is stated.'
WHERE id IN (55) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights SET notes = 'The details of the 30 ON HIM and ON HIM(R) products on the official site (Newtech Wellness, newtech-wellness.com) list only SIZE, WEIGHT BLOCK (for example 125 KG / 275.5 LB = maximum stack) and FRAME; there is no starting resistance or first-pin weight. ON HIM is a pin-loaded (weight stack) line with no plate-loaded model. The catalog PDF could not be downloaded directly (access denied), so it was not checked.'
WHERE id IN (56) AND notes ~ E'[가-힣]';

UPDATE official_machine_weights o
SET lineup = 'On Him', model_name = 'On Him lineup (model not identified)'
WHERE o.brand = 'Newtech' AND o.lineup ~ E'[\uAC00-\uD7A3]'
  AND NOT EXISTS (
    SELECT 1 FROM official_machine_weights x
    WHERE x.brand = 'Newtech' AND x.lineup = 'On Him'
      AND x.model_name = 'On Him lineup (model not identified)' AND x.setting = o.setting
  );

UPDATE brands SET name = 'Other'
WHERE name ~ E'[가-힣]' AND NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Other');
