// Names for a date's weekday (0 = Sunday) and month (0 = January), for screen text.
export const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

// Calendar defaults follow the service timezone, regardless of the browser timezone.
export function seoulDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Default journal title (#82): "Tue, Oct 20" for a YYYY-MM-DD date.
export function dateTitle(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  const weekday = weekdayNames[new Date(date + 'T00:00:00Z').getUTCDay()];
  return `${weekday}, ${monthNames[month - 1]} ${day}`;
}
