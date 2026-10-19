import React from 'react';

// Routine goals (#28). Planned targets are shown per exercise exactly as planned;
// weights of different exercises are never summed. Only saved journals are records.
export type TargetExercise = {
  exercise: string;
  sets: number;
  weight: number;
  reps: number;
  base: { sets: number; weight: number; reps: number };
};
type Change = { week: number; kind: string; amount: number; deload_metric: string | null };
export type Target = {
  order: number;
  week: number;
  is_deload: boolean;
  split_index: number;
  split_name: string;
  change: Change;
  exercises: TargetExercise[];
};
type Day = { date: string; week: number; rest: boolean; target: Target | null };
type Move = {
  order: number;
  week: number;
  is_deload: boolean;
  split_name: string;
  from: string;
  to: string | null;
};
export type Previous = { date: string; sets: { weight: number; reps: number }[] };
export type Progress = {
  today: string;
  routine: { id: number; name: string } | null;
  start_date?: string;
  end_date?: string;
  status?: string;
  current_week?: number | null;
  today_plan?: Day | null;
  this_week?: Day[];
  weeks?: {
    week: number;
    change: Change;
    entries: { date: string | null; excluded: boolean; target: Target }[];
  }[];
  excluded?: Target[];
  rested_today?: boolean;
  can_rest?: boolean;
  rest_unavailable?: string | null;
  rest_preview?: { date: string; moves: Move[]; excluded: Target[] } | null;
  previous?: Record<string, Previous>;
};
type DraftSet = {
  exercise: string;
  machine_id: number | null;
  weight: number;
  reps: number;
  notes: string;
};

const kg = (n: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n);
export const exerciseKey = (name: string) => name.trim().toLowerCase();
export const changeLabel = (c: Change) =>
  c.kind === 'deload'
    ? `디로딩 · ${c.deload_metric === 'weight' ? '총중량' : c.deload_metric === 'sets' ? '세트 수' : '반복 수'} ${c.amount}${c.deload_metric === 'weight' ? ' kg' : ''} 감소`
    : `${c.kind === 'increase_weight' ? '총중량' : '반복 수'} ${c.amount}${c.kind === 'increase_weight' ? ' kg' : ''} 증가`;
const targetLabel = (t: { week: number; is_deload: boolean; split_name: string }) =>
  `${t.week}주차${t.is_deload ? ' 디로딩' : ''} · ${t.split_name}`;
export const exerciseText = (e: { exercise: string; sets: number; weight: number; reps: number }) =>
  `${e.exercise} ${e.sets}세트 · 총중량 ${kg(e.weight)} kg · ${e.reps}회`;
export const previousText = (p: Previous | undefined) =>
  p
    ? `직전 기록 ${p.date} · ${p.sets.map((s) => `${kg(s.weight)} kg × ${s.reps}회`).join(', ')}`
    : '직전 기록 없음';

// A local journal draft prefilled from today's targets. It becomes a record only
// when the user saves it through the normal journal save flow.
export function routineDraft(progress: Progress | null) {
  const target = progress?.routine && progress.today_plan?.target;
  if (!progress?.routine || !target) return null;
  const sets: DraftSet[] = target.exercises
    .flatMap((e) =>
      Array.from({ length: e.sets }, () => ({
        exercise: e.exercise,
        machine_id: null,
        weight: e.weight,
        reps: e.reps,
        notes: '',
      })),
    )
    .slice(0, 200);
  return {
    date: progress.today,
    title: `${progress.routine.name} · ${target.split_name}`.slice(0, 120),
    notes: '',
    sets,
  };
}

// Reference shown next to a journal set whose exercise is in today's routine.
export function setReference(progress: Progress | null, exercise: string) {
  const key = exerciseKey(exercise);
  const planned = progress?.today_plan?.target?.exercises.find(
    (e) => exerciseKey(e.exercise) === key,
  );
  if (!planned) return null;
  return `오늘 목표 ${kg(planned.weight)} kg × ${planned.reps}회 · ${previousText(progress?.previous?.[key])}`;
}

export function RoutineProgress({
  progress,
  error,
  busy,
  confirming,
  draftDisabled,
  onQuick,
  onRestStart,
  onRestBack,
  onRestConfirm,
  onRestCancel,
  onReload,
}: {
  progress: Progress | null;
  error: string;
  busy: boolean;
  confirming: boolean;
  draftDisabled: boolean;
  onQuick: () => void;
  onRestStart: () => void;
  onRestBack: () => void;
  onRestConfirm: () => void;
  onRestCancel: () => void;
  onReload: () => void;
}) {
  const today = progress?.today_plan;
  const preview = progress?.rest_preview;
  return (
    <section className="card routine-progress" aria-label="루틴 목표">
      <div className="section-title">
        <div>
          <h2>루틴 목표</h2>
          <p>계획한 목표입니다. 저장한 운동 일지만 실제 기록으로 반영합니다.</p>
        </div>
      </div>
      <div className="progress-body">
        {error && (
          <p role="alert" className="error">
            {error}{' '}
            <button type="button" onClick={onReload}>
              루틴 목표 다시 불러오기
            </button>
          </p>
        )}
        {!progress ? (
          <p role="status">루틴 목표를 불러오는 중…</p>
        ) : !progress.routine ? (
          <p>
            진행 중인 루틴이 없습니다. 루틴짜기에서 시작일이 오늘이거나 그 이전인 12주 루틴을 만들면
            오늘·이번 주·12주 목표가 표시됩니다.
          </p>
        ) : (
          <>
            <p>
              <strong>{progress.routine.name}</strong> · {progress.start_date} — {progress.end_date}
              {progress.current_week ? ` · 현재 ${progress.current_week}주차` : ' · 루틴 기간 종료'}
            </p>
            <h3>오늘 목표 · {progress.today}</h3>
            {!today ? (
              <p>오늘은 계획된 운동일이 아닙니다.</p>
            ) : today.rest ? (
              <p role="status">
                오늘은 휴식일로 지정했습니다. 남은 목표가 한 운동일씩 뒤로 이동했습니다.{' '}
                <button type="button" disabled={busy} onClick={onRestCancel}>
                  휴식 취소
                </button>
              </p>
            ) : today.target ? (
              <>
                <p>
                  {targetLabel(today.target)} · {changeLabel(today.target.change)}
                </p>
                <ul className="target-list">
                  {today.target.exercises.map((e, i) => (
                    <li key={i}>
                      <strong>{exerciseText(e)}</strong>
                      <small>
                        {' '}
                        (기준 {e.base.sets}세트 · {kg(e.base.weight)} kg · {e.base.reps}회) ·{' '}
                        {previousText(progress.previous?.[exerciseKey(e.exercise)])}
                      </small>
                    </li>
                  ))}
                </ul>
                <div className="progress-actions">
                  <button
                    type="button"
                    className="subtle-button"
                    disabled={draftDisabled || busy}
                    onClick={onQuick}
                  >
                    오늘 루틴으로 기록하기
                  </button>
                  {progress.can_rest && !confirming && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={onRestStart}
                    >
                      오늘 하루 휴식하기
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p>오늘 남은 계획 목표가 없습니다.</p>
            )}
            {confirming && preview && (
              <div className="rest-preview" role="group" aria-label="휴식 전 확인">
                <p>
                  오늘을 휴식일로 지정하면 아래 목표가 한 운동일씩 뒤로 이동합니다. 12주 종료일은
                  그대로이며 저장한 일지는 바뀌지 않습니다. 휴식 취소는 오늘만 할 수 있습니다.
                </p>
                <ol>
                  {preview.moves.map((m) => (
                    <li key={m.order}>
                      {targetLabel(m)} · {m.from} → {m.to ?? '제외됨'}
                    </li>
                  ))}
                </ol>
                <p>
                  제외될 마지막 목표:{' '}
                  {preview.excluded
                    .map((t) => `${targetLabel(t)} (${t.order}번째 목표)`)
                    .join(', ') || '없음'}
                </p>
                <button type="button" className="primary" disabled={busy} onClick={onRestConfirm}>
                  {busy ? '처리 중…' : '휴식 확정'}
                </button>
                <button type="button" disabled={busy} onClick={onRestBack}>
                  돌아가기
                </button>
              </div>
            )}
            <h3>이번 주 운동일</h3>
            {progress.this_week?.length ? (
              <ul className="target-list">
                {progress.this_week.map((d) => (
                  <li key={d.date}>
                    <strong>{d.date}</strong> ·{' '}
                    {d.rest
                      ? '휴식'
                      : d.target
                        ? `${targetLabel(d.target)} · ${d.target.exercises.map(exerciseText).join(' / ')}`
                        : '목표 없음'}
                  </li>
                ))}
              </ul>
            ) : (
              <p>이번 주 계획된 운동일이 없습니다.</p>
            )}
            <details>
              <summary>12주 전체 목표</summary>
              <table className="week-table">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>계획 변화</th>
                    <th>운동일 · 종목별 목표</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.weeks?.map((w) => (
                    <tr key={w.week}>
                      <th>{w.week}주차</th>
                      <td>{changeLabel(w.change)}</td>
                      <td>
                        <ul>
                          {w.entries.map((e) => (
                            <li key={e.target.order} className={e.excluded ? 'excluded' : ''}>
                              {e.excluded ? '제외됨' : e.date} · {e.target.split_name} ·{' '}
                              {e.target.exercises.map(exerciseText).join(' / ')}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
