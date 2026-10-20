// Weeks start on Monday, in the user's local time zone.
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export interface Progress {
  thisWeek: number;
  goal: number;
  streakWeeks: number; // consecutive weeks meeting the goal, counting this week only once it is met
}

export function progress(commentTimes: number[], goal: number, now = Date.now()): Progress {
  const perWeek = new Map<number, number>();
  for (const t of commentTimes) {
    const w = weekStart(t);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const current = weekStart(now);
  const thisWeek = perWeek.get(current) ?? 0;
  let streakWeeks = thisWeek >= goal ? 1 : 0;
  // Walk back one week at a time. Step via the date, not 7*24h, so DST changes cannot skip a week.
  const cursor = new Date(current);
  for (;;) {
    cursor.setDate(cursor.getDate() - 7);
    if ((perWeek.get(cursor.getTime()) ?? 0) < goal) break;
    streakWeeks++;
  }
  return { thisWeek, goal, streakWeeks };
}
