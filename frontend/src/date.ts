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

// Default journal title (#82): "10월 20일(화)" for a YYYY-MM-DD date.
export function dateTitle(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  const weekday = '일월화수목금토'[new Date(date + 'T00:00:00Z').getUTCDay()];
  return `${month}월 ${day}일(${weekday})`;
}
