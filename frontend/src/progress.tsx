import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
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

// `.legacy p` sets 12px muted text, so paragraphs in this card name their own size.
const text = 'text-sm text-muted-foreground';
const heading = 'mt-5 mb-1.5 text-sm font-semibold';
const list = 'my-1.5 space-y-1.5 pl-4 text-sm';
const cell =
  '[&>td]:border-t [&>td]:px-1.5 [&>td]:py-2 [&>td]:text-left [&>td]:align-top [&>th]:border-t [&>th]:px-1.5 [&>th]:py-2 [&>th]:text-left [&>th]:align-top';

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
    <Card role="region" aria-label="루틴 목표" className="mb-6 gap-0 py-0 shadow-none">
      <CardHeader className="px-4 pt-5 md:px-6 md:pt-6">
        <CardTitle asHeading="h2" className="text-body font-semibold">
          루틴 목표
        </CardTitle>
        <CardDescription className="text-caption">
          계획한 목표입니다. 저장한 운동 일지만 실제 기록으로 반영합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pt-2 pb-5 text-sm md:px-6 md:pb-6">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            {error}{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-destructive underline"
              onClick={onReload}
            >
              루틴 목표 다시 불러오기
            </Button>
          </p>
        )}
        {!progress ? (
          <p role="status" className={text}>
            루틴 목표를 불러오는 중…
          </p>
        ) : !progress.routine ? (
          <p className={text}>
            진행 중인 루틴이 없습니다. 루틴짜기에서 시작일이 오늘이거나 그 이전인 12주 루틴을 만들면
            오늘·이번 주·12주 목표가 표시됩니다.
          </p>
        ) : (
          <>
            <p className={text}>
              <strong className="font-semibold text-foreground">{progress.routine.name}</strong> ·{' '}
              {progress.start_date} — {progress.end_date}
              {progress.current_week ? ` · 현재 ${progress.current_week}주차` : ' · 루틴 기간 종료'}
            </p>
            {progress.progression === 'auto' && (
              <p className="mt-2 rounded-md bg-muted p-3 text-meta">
                자동 목표(이중 점진 과부하): 분할의 세션(운동일)마다 진행합니다. 세션 날짜부터 같은
                분할의 다음 세션 전까지 저장한 일지에서 계획 세트를 모두 목표 이상으로 수행하면 다음
                세션에서 진행하고, 못하면 같은 목표를 유지합니다. 기록이 없는 앞으로의 목표는
                예상입니다.
              </p>
            )}
            <h3 className={heading}>오늘 목표 · {progress.today}</h3>
            {!today ? (
              <p className={text}>오늘은 계획된 운동일이 아닙니다.</p>
            ) : today.rest ? (
              <p role="status" className={text}>
                오늘은 휴식일로 지정했습니다. 남은 목표가 한 운동일씩 뒤로 이동했습니다.{' '}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onRestCancel}
                >
                  휴식 취소
                </Button>
              </p>
            ) : today.target ? (
              <>
                <p className={text}>
                  {sessionLabel(today.target, auto)} ·{' '}
                  {changeLabel(today.target.change, today.target.is_deload)}
                </p>
                <ul data-slot="target-list" className={list}>
                  {today.target.exercises.map((e, i) => (
                    <li key={i}>
                      <strong className="font-semibold">{exerciseText(e)}</strong>
                      <small className="text-meta">
                        {' '}
                        (기준 {e.base.sets}세트 · {kg(e.base.weight)} kg · {e.base.reps}회) ·{' '}
                        {previousText(progress.previous?.[exerciseKey(e.exercise)])}
                      </small>
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={draftDisabled || busy}
                    onClick={onQuick}
                  >
                    오늘 루틴으로 기록하기
                  </Button>
                  {progress.can_rest && !confirming && (
                    <Button type="button" variant="ghost" disabled={busy} onClick={onRestStart}>
                      오늘 하루 휴식하기
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className={text}>오늘 남은 계획 목표가 없습니다.</p>
            )}
            {confirming && preview && (
              <div
                role="group"
                aria-label="휴식 전 확인"
                className="mt-3.5 space-y-2 rounded-md bg-muted p-3.5 text-sm"
              >
                <p className="text-sm">
                  오늘을 휴식일로 지정하면 아래 목표가 한 운동일씩 뒤로 이동합니다. 12주 종료일은
                  그대로이며 저장한 일지는 바뀌지 않습니다. 휴식 취소는 오늘만 할 수 있습니다.
                </p>
                <ol className="space-y-1 pl-4">
                  {preview.moves.map((m) => (
                    <li key={m.order}>
                      {targetLabel(m)} · {m.from} → {m.to ?? '제외됨'}
                    </li>
                  ))}
                </ol>
                <p className="text-sm">
                  제외될 마지막 목표:{' '}
                  {preview.excluded
                    .map((t) => `${targetLabel(t)} (${t.order}번째 목표)`)
                    .join(', ') || '없음'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" disabled={busy} onClick={onRestConfirm}>
                    {busy ? '처리 중…' : '휴식 확정'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={onRestBack}>
                    돌아가기
                  </Button>
                </div>
              </div>
            )}
            <h3 className={heading}>이번 주 운동일</h3>
            {progress.this_week?.length ? (
              <ul data-slot="target-list" className={list}>
                {progress.this_week.map((d) => (
                  <li key={d.date}>
                    <strong className="font-semibold">{d.date}</strong> ·{' '}
                    {d.rest
                      ? '휴식'
                      : d.target
                        ? `${sessionLabel(d.target, auto)} · ${d.target.exercises.map(exerciseText).join(' / ')}`
                        : '목표 없음'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={text}>이번 주 계획된 운동일이 없습니다.</p>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">12주 전체 목표</summary>
              {/* Narrow screens scroll the table sideways instead of widening the page. The
                  box takes focus so keyboard users can scroll it too (axe scrollable-region-focusable). */}
              <div
                role="region"
                aria-label="12주 전체 목표 표"
                // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must be focusable.
                tabIndex={0}
                className="mt-2 overflow-x-auto rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className={cell}>
                      <th>주차</th>
                      <th>계획 변화</th>
                      <th>운동일 · 종목별 목표</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.weeks?.map((w) => (
                      <tr key={w.week} className={cell}>
                        <th className="whitespace-nowrap">{w.week}주차</th>
                        <td>{changeLabel(w.change, w.is_deload ?? w.week % 4 === 0)}</td>
                        <td>
                          <ul className="space-y-0.5 pl-4">
                            {w.entries.map((e) => (
                              <li
                                key={e.target.order}
                                data-excluded={e.excluded || undefined}
                                className={e.excluded ? 'text-muted-foreground' : undefined}
                              >
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
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
