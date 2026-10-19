// Proposed public contract for #27. Amounts are manually supplied changes,
// never generated percentages; weight always means total kg.
export const bodyParts = ['가슴', '등', '어깨', '팔', '하체-앞', '하체-뒤', '복근'];
export function routineInput(splitCount = 2) {
  return {
    name: '수동 12주 루틴',
    start_date: '2024-02-29',
    split_count: splitCount,
    weekly_workouts: 3,
    rest_days: [0, 2, 4, 6], // Sunday=0; train Monday, Wednesday, Friday.
    splits: Array.from({ length: splitCount }, (_, index) => ({
      name: `분할 ${index + 1}`,
      body_parts: index === 0 ? [...bodyParts, '가슴'] : ['등', '가슴'],
      exercises: [
        { exercise: '스쿼트', sets: 3, weight: 100.25, reps: 10 },
        { exercise: '맨몸 런지', sets: 2, weight: 0, reps: 12 },
      ],
    })),
    weeks: Array.from({ length: 12 }, (_, index) => {
      const week = index + 1;
      return {
        week,
        kind: week % 4 === 0 ? 'deload' : week % 2 ? 'increase_weight' : 'increase_reps',
        amount: week % 4 === 0 ? 12.5 : week === 5 ? 7.25 : week % 2 ? 2.5 : 1,
        deload_metric: week % 4 === 0 ? 'weight' : null,
      };
    }),
  };
}
export type RoutineInput = ReturnType<typeof routineInput>;
export type SavedRoutine = RoutineInput & {
  id: number;
  schedule: { date: string; week: number; split_index: number; is_deload: boolean }[];
};
