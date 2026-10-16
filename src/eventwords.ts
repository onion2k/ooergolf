/**
 * The words a tournament is told in: a place as golf says it, a score against par, the sticker on the card at the end of
 * an event, and the lines that say what a season is played for and where it stands. Worked out here, from numbers, and
 * only drawn by the hud, so a word that reads wrong is a test that fails and not a picture someone has to notice.
 *
 * A leaf: it knows the season's grades by name and nothing of the game.
 */
import { GRADES, type Grade } from './season';

/** A grade as a player reads it. */
export function gradeName(grade: Grade): string {
  return grade === 'club' ? 'Club' : grade === 'county' ? 'County' : 'Championship';
}

/** A place as an ordinal: 1st, 2nd, 3rd, 4th, and 11th to 13th as the exceptions they are. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const end = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${end}`;
}

/** A place on a leaderboard: its number, with a T before it when it is shared. */
export function placeText(place: number, tied: boolean): string {
  return `${tied ? 'T' : ''}${place}`;
}

/** Strokes against par as a leaderboard has them: a true minus, E for level, a plus over. */
export function toParText(n: number): string {
  return n === 0 ? 'E' : n < 0 ? `−${-n}` : `+${n}`;
}

/** The sticker on the card at an event's end: the place, and what it won, where it won anything. */
export function stickerText(place: number, tied: boolean, prize: number): string {
  const at = tied ? `T${place}` : ordinal(place);
  return prize > 0 ? `${at} · ${prize} ${prize === 1 ? 'coin' : 'coins'}` : at;
}

/** The line over an event's name: the tour's grade, and the event's place in the season. */
export function eventHeader(grade: Grade, event: number, events: number): string {
  return `${gradeName(grade)} tour · Event ${event} of ${events}`;
}

/**
 * What the season is played for, under the order of merit: the grade above, or the title at the top. The season's length is
 * on the line over the event's name, so this is one line on the narrowest phone.
 */
export function promotionLine(grade: Grade, promoted: number): string {
  const up = GRADES[GRADES.indexOf(grade) + 1] as Grade | undefined;
  return `Top ${promoted} ${up ? `go up to the ${gradeName(up)} tour` : 'are champions'}`;
}

/** The leaderboard's foot: where the last paid place stands against par, and how many of the field are behind you. */
export function cutLine(cut: number, behind: number): string {
  return `cut ${toParText(cut)} · ${behind > 0 ? behind : 'none'} behind you`;
}

/** How the order of merit moved with an event: from one place to another, or not at all; from nought, a season's first, it only says where. */
export function meritMove(from: number, to: number): string {
  if (from === 0) return `Order of merit: ${ordinal(to)}`;
  return from === to
    ? `Order of merit: ${ordinal(to)}, as before`
    : `Order of merit: ${ordinal(from)} → ${ordinal(to)}`;
}

/** What a season's end means, said on the card of its last event; nothing at any other event. */
export function seasonLine(over: boolean, promotedTo: Grade | null, title: boolean): string {
  if (!over) return '';
  if (title) return 'Season over: champions of the Championship';
  if (promotedTo) return `Season over: up to the ${gradeName(promotedTo)} tour`;
  return 'Season over: another season at this grade';
}
