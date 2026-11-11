/**
 * The calendar's arithmetic on days, as `YYYY-MM-DD` strings: the UTC day of a moment, whether a string is a day, how many days since
 * 1 January 1970, the day so many days on, and the words for it. A leaf with no import, so that the save can say what a day is without
 * importing the generator, and so that no clock is read here but a `Date` it is handed: the page reads the time once and passes the
 * day in, and a test holds it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The UTC day of a moment, as `YYYY-MM-DD`: where a day turns, for every player at once. */
export function utcDay(date: Date): string {
  const y = date.getUTCFullYear();
  return `${String(y).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Whether `day` is a day: `YYYY-MM-DD`, a real date (a day the calendar would carry over, such as 30 February, is not one). */
export function isDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(day)) return false;
  const [, m, d] = day.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && dayOf(dayNumber(day)) === day;
}

/** How many days `day` is after 1 January 1970, by the civil calendar's own arithmetic, so no clock is read to work it out. */
export function dayNumber(day: string): number {
  const [y0, m, d] = day.split('-').map(Number);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

/** The day that is `n` days after day number `n` since 1 January 1970: the inverse of `dayNumber`. */
function dayOf(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The day `by` days from `day`: before it if `by` is negative. */
export function shiftDay(day: string, by: number): string {
  return dayOf(dayNumber(day) + by);
}

/** Whether `next` is the day after `day`: what a run of days is made of. */
export function followsDay(day: string, next: string): boolean {
  return isDay(day) && isDay(next) && dayNumber(next) === dayNumber(day) + 1;
}

/** A day as the card says it: `11 Nov 2026`. */
export function dayWords(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
