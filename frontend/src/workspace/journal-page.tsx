import { useQueryClient } from '@tanstack/react-query';
import type React from 'react';

import { CardioTab } from '../cardio/cardio-tab';
import { SegmentedControl } from '../components/ui/segmented-control';
import { RoutineProgress } from '../progress';
import type { CardioPreset } from '../routine-cardio';
import { cleanDate, type Goal, type JournalTab, journalTabs, today } from './model';
import { StatsGrid } from './stats-grid';
import type { useRoutineProgress } from './use-routine-progress';
import { type RecordsProps, WorkoutRecords } from './workout-records';

/** The journal: the Strength/Cardio tab, today's routine card and the records of the period. */
export function JournalPage({
  periodControls,
  journalTab,
  setJournalTab,
  from,
  to,
  goals,
  recordsProps,
  routine,
  quickWorkout,
  cardioPreset,
  setCardioPreset,
  clearCardioPreset,
}: {
  periodControls: React.ReactNode;
  journalTab: JournalTab;
  setJournalTab: (tab: JournalTab) => void;
  from: string;
  to: string;
  goals: Goal[];
  recordsProps: RecordsProps;
  routine: ReturnType<typeof useRoutineProgress>;
  quickWorkout: () => void;
  cardioPreset: CardioPreset | null;
  setCardioPreset: (preset: CardioPreset | null) => void;
  clearCardioPreset: () => void;
}) {
  const queryClient = useQueryClient();
  const { workouts, recovery, saving } = recordsProps;
  const {
    progress,
    progressError,
    restBusy,
    restConfirm,
    setRestConfirm,
    changeRest,
    loadProgress,
  } = routine;
  return (
    <>
      <SegmentedControl
        label="Record type"
        className="mb-4"
        options={journalTabs}
        value={journalTab}
        onValueChange={setJournalTab}
      />
      {journalTab === 'cardio' ? (
        <>
          {periodControls}
          <CardioTab
            from={from}
            to={to}
            today={today()}
            workouts={workouts.map((w) => ({
              id: w.id,
              date: cleanDate(w.date),
              title: w.title,
            }))}
            onChanged={() => void queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] })}
            preset={cardioPreset}
            onPresetUsed={clearCardioPreset}
          />
        </>
      ) : (
        <>
          {periodControls}
          <StatsGrid workouts={workouts} goals={goals} cardioSessions={[]} />
          <RoutineProgress
            progress={progress}
            error={progressError}
            busy={restBusy}
            confirming={restConfirm}
            draftDisabled={recovery || saving}
            onQuick={quickWorkout}
            onCardio={(preset) => {
              setCardioPreset(preset);
              setJournalTab('cardio');
            }}
            onRestStart={() => setRestConfirm(true)}
            onRestBack={() => setRestConfirm(false)}
            onRestConfirm={() => void changeRest('POST')}
            onRestCancel={() => void changeRest('DELETE')}
            onReload={() => void loadProgress()}
          />
          <WorkoutRecords {...recordsProps} />
        </>
      )}
    </>
  );
}
