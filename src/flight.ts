/**
 * The strike: a club, how hard the drag was, where it was aimed and what the ball lies on, turned into the launch
 * the ball leaves the face with. Pure arithmetic and chance handed in, so it is tried without a game and the game's
 * own chance is the only source there is.
 *
 * The club fixes the loft, which the sand raises a little; the lie takes a share of the speed (the rough a quarter);
 * and a full swing is not exact. The scatter grows with the power dragged, so gentle swings are true and hard ones
 * risk a miss, as a drag of more power would in a real swing: an angle off the aim, either way, and a loss of speed,
 * never a gain, so no club ever strikes harder than it can. A putter is the player's own aim and spends no chance at
 * all, which keeps a round of minigolf the very game it was.
 */
import { strikeSpeed } from './arena';
import { carrying, type BagClub } from './bag';
import type { Random } from './random';
import { SURFACES, type Lie } from './surfaces';

/** What a mishit loses: at most this share of the speed, at full power, and less the gentler the drag. */
export const DISPERSION = { loss: 0.08 } as const;

/** A launch: the velocity the ball leaves the face with, along the aim and up. */
export interface Launch {
  vx: number;
  vy: number;
  vz: number;
}

/** The furthest, in radians, that a swing of `power` from `lie` may miss its aim, either way. */
export function maxScatter(club: BagClub, lie: Lie, power: number): number {
  return (club.spread * SURFACES[lie].wild * Math.max(0, Math.min(1, power)) * Math.PI) / 180;
}

/** A number from minus one to one that is most likely nought, from two draws: bounded, so a limit on it is a fact. */
function triangle(random: Random): number {
  return random() + random() - 1;
}

/**
 * The launch of `club` struck at `power` (nought to one) toward `angle` from a ball that lies on `lie`. Four draws
 * of chance, or none for a club with no spread: two for the angle it misses by, and two for the speed it loses, of
 * which half the swings lose nothing.
 */
export function strike(club: BagClub, power: number, angle: number, lie: Lie, random: Random): Launch {
  const surface = SURFACES[lie];
  const p = Math.max(0, Math.min(1, power));
  let speed = strikeSpeed(p, club.hardest) * surface.power;
  let aim = angle;
  if (club.spread > 0) {
    aim += triangle(random) * maxScatter(club, lie, p);
    speed *= 1 - Math.max(0, triangle(random)) * DISPERSION.loss * p;
  }
  // the sand's lip stands the ball up; the putter's loft is none, and stays none
  const loft = club.loft > 0 ? ((club.loft + surface.loft) * Math.PI) / 180 : 0;
  const along = speed * Math.cos(loft);
  return { vx: Math.cos(aim) * along, vy: Math.sin(aim) * along, vz: speed * Math.sin(loft) };
}

/** How far a shot of `power` carries on the level from `lie`, with no scatter: what the aim's marker shows. */
export function carryFrom(club: BagClub, power: number, lie: Lie): number {
  const surface = SURFACES[lie];
  const speed = strikeSpeed(Math.max(0, Math.min(1, power)), club.hardest) * surface.power;
  return carrying(speed, club.loft > 0 ? club.loft + surface.loft : 0);
}
