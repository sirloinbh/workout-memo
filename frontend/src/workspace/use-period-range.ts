import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { parseRange } from '../date-range';
import {
  calendarDate,
  isLogPage,
  iso,
  type JournalTab,
  logPeriod,
  type Page,
  today,
} from './model';

/**
 * The selected period: a preset around a reference date, or a directly chosen range kept in the
 * address (?from&to, #85). The journal's Strength/Cardio tab (#115) lives in the address too; each
 * one changes only its own parameters.
 */
export function usePeriodRange(page: Page) {
  const [searchParams, setSearchParams] = useSearchParams();
  const customRange = parseRange(searchParams.get('from'), searchParams.get('to'));
  const badRangeAddress = !customRange && (searchParams.has('from') || searchParams.has('to'));
  const journalTab: JournalTab = searchParams.get('tab') === 'cardio' ? 'cardio' : 'strength';
  const setJournalTab = (next: JournalTab) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === 'cardio') params.set('tab', 'cardio');
      else params.delete('tab');
      return params;
    });
  const setRangeAddress = (range: { from: string; to: string } | null) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('from');
      params.delete('to');
      if (range) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      return params;
    });
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [customErrors, setCustomErrors] = useState<{ from?: string; to?: string }>({});
  // #123: until a preset is chosen, body measurements default to 12 weeks because they
  // are recorded about weekly; the dashboard and journal default to one week.
  // #504: a chosen preset belongs to the page it was chosen on; the day log opens on one day and
  // the Week and 12-week views on their own period.
  const [chosen, setChosen] = useState<{ page: Page | 'shared'; value: string } | null>(null);
  // The log pages each keep their own preset; every other page shares one.
  const scope = isLogPage(page) ? page : 'shared';
  const setPeriod = (value: string) => setChosen({ page: scope, value });
  const period =
    (chosen?.page === scope ? chosen.value : undefined) ??
    logPeriod[page] ??
    (page === 'body' ? '12weeks' : 'week');
  const [anchor, setAnchor] = useState(today());
  const range = () => {
    if (customRange) return customRange;
    const start = calendarDate(anchor);
    let end = new Date(start);
    if (period === 'week') {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
    } else if (period === 'month') {
      start.setUTCDate(1);
      end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
    } else if (period === '4weeks' || period === '12weeks') {
      start.setUTCDate(start.getUTCDate() - (period === '4weeks' ? 27 : 83));
    }
    return { from: iso(start), to: iso(end) };
  };
  const { from, to } = range();
  function move(dir: number) {
    const d = calendarDate(anchor);
    if (period === 'month') {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + dir);
    } else
      d.setUTCDate(
        d.getUTCDate() +
          dir * (period === 'day' ? 1 : period === 'week' ? 7 : period === '4weeks' ? 28 : 84),
      );
    setAnchor(iso(d));
  }
  return {
    customRange,
    badRangeAddress,
    journalTab,
    setJournalTab,
    setRangeAddress,
    customOpen,
    setCustomOpen,
    customDraft,
    setCustomDraft,
    customErrors,
    setCustomErrors,
    period,
    setPeriod,
    anchor,
    setAnchor,
    from,
    to,
    move,
  };
}
export type PeriodRange = ReturnType<typeof usePeriodRange>;
