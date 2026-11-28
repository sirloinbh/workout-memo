import type { Feedback } from '../../../shared/contract';
import { seoulDate } from '../date';
import type { NoticeValue } from '../lib/use-notice';

export type SetRow = {
  exercise: string;
  machine_id: number | null;
  // #383: undefined only while the field is emptied in the editor; saved rows always have both.
  weight: number | undefined;
  reps: number | undefined;
  notes: string;
  // Missing on rows saved before completion tracking; those count as completed.
  completed?: boolean;
  rpe?: number | null;
  // #382: a client-side id, so a row keeps its own state when another set is removed. It never leaves
  // the browser: saving strips it.
  _key?: string;
};
let keyCounter = 0;
const newSetKey = () => `${Date.now().toString(36)}-${(keyCounter++).toString(36)}`;
/** Gives every set a unique `_key`; a set copied from another one (add set) gets its own. */
export function withSetKeys<T extends { sets?: SetRow[] }>(editor: T): T;
export function withSetKeys<T extends { sets?: SetRow[] }>(editor: T | null): T | null;
export function withSetKeys<T extends { sets?: SetRow[] }>(editor: T | null): T | null {
  if (!editor?.sets) return editor;
  const seen = new Set<string>();
  return {
    ...editor,
    sets: editor.sets.map((s) => {
      const key = s._key && !seen.has(s._key) ? s._key : newSetKey();
      seen.add(key);
      return s._key === key ? s : { ...s, _key: key };
    }),
  };
}
/** The editor as the server gets it, without the client ids. */
export function withoutSetKeys<T extends { sets?: SetRow[] }>(editor: T): T {
  if (!editor.sets) return editor;
  return { ...editor, sets: editor.sets.map(({ _key: _ignored, ...s }) => s) };
}
// Only completed sets are actual performance for statistics and goals.
export const done = (s: SetRow) => s.completed !== false;
// #268: below 480px a set field's name sits beside it, not above, so a set card fits between
// the pinned rest timer and save bar; a fixed width lines the fields up.
export const setFieldName = 'w-20 shrink-0 min-[480px]:w-auto';
export const setField =
  'mb-0 text-meta max-[480px]:flex-row max-[480px]:items-center max-[480px]:[&>:last-child]:min-w-0 max-[480px]:[&>:last-child]:flex-1';
export const repeatTapWindow = 700;
export type Workout = {
  id: number;
  version?: number;
  date: string;
  title: string;
  notes: string;
  // #83: how the whole workout felt; null or missing means not recorded.
  feedback?: Feedback | null;
  sets: SetRow[];
};
export const feedbackLabels: Record<Feedback, string> = {
  hard: 'Hard',
  medium: 'Medium',
  easy: 'Easy',
};
export type Machine = {
  id: number;
  brand_id: number;
  brand: string;
  name: string;
  base_weight: number | null;
  notes: string;
  official_weight_id?: number | null;
  official_status?: OfficialWeight['status'] | null;
  official_model_name?: string | null;
  official_setting?: string | null;
  official_raw_value?: number | null;
  official_raw_unit?: string | null;
  official_weight_kg?: number | null;
  official_basis?: OfficialWeight['basis'];
  official_source_url?: string | null;
  official_checked_date?: string | null;
  // #84: single-joint machines use the single-joint rest.
  single_joint?: boolean;
};
// Manufacturer starting resistance (no plates). Reference only: never added to a set total.
export type OfficialWeight = {
  id: number;
  brand: string;
  lineup: string;
  model_number: string;
  model_name: string;
  official_item_name: string;
  setting: string;
  status: 'verified' | 'unverified' | 'conflict';
  raw_value: number | null;
  raw_unit: string | null;
  official_kg_text: string | null;
  weight_kg: number | null;
  basis: 'per_arm' | 'combined' | 'unspecified' | null;
  source_url: string | null;
  checked_date: string;
  notes: string;
};
export const basisLabel = {
  per_arm: 'One side',
  combined: 'Combined',
  unspecified: 'No reference shown',
} as const;
export function officialLabel(r: {
  status?: OfficialWeight['status'] | null;
  raw_value?: number | null;
  raw_unit?: string | null;
  weight_kg?: number | null;
  basis?: OfficialWeight['basis'];
}) {
  if (r.status !== 'verified' && r.status !== 'conflict') return 'Official value unconfirmed';
  if (r.raw_value === null || r.raw_value === undefined || r.weight_kg == null)
    return 'Official value unconfirmed';
  const raw = r.raw_unit === 'kg' ? '' : `${fmt(r.raw_value)} ${r.raw_unit} = `;
  return (
    `${raw}${fmt(r.weight_kg)} kg · ${r.basis ? basisLabel[r.basis] : 'Basis not stated'}` +
    (r.status === 'conflict' ? ' · Official sources disagree' : '')
  );
}
export type Goal = {
  id: number;
  exercise: string;
  target_weight: number;
  target_reps: number;
  start_date: string;
  deadline: string;
  achieved: boolean;
};
export const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
export const today = () => seoulDate();
// Calendar dates use UTC arithmetic so device time zones and DST cannot shift boundaries.
export const calendarDate = (value: string) => new Date(value + 'T12:00:00Z');
export const cleanDate = (v: string) => v.slice(0, 10);
export const dateLabel = (v: string) =>
  calendarDate(cleanDate(v)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
export const vol = (w: Workout) =>
  w.sets.filter(done).reduce((n, s) => n + Number(s.weight) * (s.reps ?? 0), 0);
export const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
// #105: weight − / + moves by 5 kg (user decision); typing still allows 0.25 kg.
export const weightStep = 5;
// #223: the save progress line ("Saving…", "Saved to server") as a polite Notice.
export const statusNotice = (text: string): NoticeValue | undefined =>
  text ? { kind: 'status', text } : undefined;
// #62: every page has its own URL, so refresh, links and back navigation keep it.
export const pages = {
  // #504: the day log is the start page; Week and 12 weeks are the same records over a longer
  // period, each with its own address so the menu can mark the one that is open.
  journal: '/',
  week: '/week',
  weeks12: '/12-weeks',
  overview: '/dashboard',
  goals: '/goals',
  analysis: '/analysis',
  routines: '/routines',
  body: '/body',
  machines: '/machines',
  backup: '/backup',
  settings: '/settings',
} as const;
export type Page = keyof typeof pages;
// #115: the journal's record kinds; Strength is the default and has no address parameter.
export type JournalTab = 'strength' | 'cardio';
export const journalTabs = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
] as const satisfies readonly { value: JournalTab; label: string }[];
export const periodOptions = [
  { value: 'day', label: '1 day' },
  { value: 'week', label: '1 week' },
  { value: 'month', label: '1 month' },
  { value: '4weeks', label: '4 weeks' },
  { value: '12weeks', label: '12 weeks' },
  { value: 'custom', label: 'Custom' },
];

/** The day log and its Week and 12-week views show the same journal page (#504). */
export const isLogPage = (page: Page) =>
  page === 'journal' || page === 'week' || page === 'weeks12';
/** The period a log page opens with until a preset is chosen on it. */
export const logPeriod: Partial<Record<Page, string>> = {
  journal: 'day',
  week: 'week',
  weeks12: '12weeks',
};

export const pageOf = (path: string) =>
  (Object.keys(pages) as Page[]).find((key) => pages[key] === path.replace(/(.)\/$/, '$1'));
