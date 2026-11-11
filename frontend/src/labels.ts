// Shared English labels for values the app stores in another form.

// "1 set", "2 sets": the count with its noun in the right number.
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Body parts are stored with these Korean values (saved routines and exercise mappings use
// them), so the screens show an English name for each stored value.
const bodyPartNames: Record<string, string> = {
  가슴: 'Chest',
  등: 'Back',
  어깨: 'Shoulders',
  팔: 'Arms',
  이두: 'Biceps',
  삼두: 'Triceps',
  '하체-앞': 'Legs (front)',
  '하체-뒤': 'Legs (back)',
  복근: 'Abs',
  미분류: 'Unclassified',
};
export const bodyPartLabel = (part: string) => bodyPartNames[part] ?? part;
