import {
  changeLabel,
  exerciseKey,
  exerciseText,
  kg,
  previousText,
  type Progress,
  sessionLabel,
  targetLabel,
} from './progress-data';

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
  const auto = progress?.progression === 'auto';
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
            {progress.progression === 'auto' && (
              <p className="form-hint">
                자동 목표(이중 점진 과부하): 분할의 세션(운동일)마다 진행합니다. 세션 날짜부터 같은
                분할의 다음 세션 전까지 저장한 일지에서 계획 세트를 모두 목표 이상으로 수행하면 다음
                세션에서 진행하고, 못하면 같은 목표를 유지합니다. 기록이 없는 앞으로의 목표는
                예상입니다.
              </p>
            )}
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
                  {sessionLabel(today.target, auto)} ·{' '}
                  {changeLabel(today.target.change, today.target.is_deload)}
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
                        ? `${sessionLabel(d.target, auto)} · ${d.target.exercises.map(exerciseText).join(' / ')}`
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
                      <td>{changeLabel(w.change, w.is_deload ?? w.week % 4 === 0)}</td>
                      <td>
                        <ul>
                          {w.entries.map((e) => (
                            <li key={e.target.order} className={e.excluded ? 'excluded' : ''}>
                              {e.excluded ? '제외됨' : e.date} ·{' '}
                              {auto && e.target.session ? `${e.target.session}번째 · ` : ''}
                              {e.target.split_name} ·{' '}
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
