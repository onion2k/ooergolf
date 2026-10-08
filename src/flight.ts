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
import { boosted, carrying, isIron, loftOf, type BagClub } from './bag';
import type { Random } from './random';
import { NO_KIT, type Kit } from './items';
import { surfaceFor, type Lie } from './surfaces';

/** What a mishit loses: at most this share of the speed, at full power, and less the gentler the drag. */
export const DISPERSION = { loss: 0.08 } as const;

/** A launch: the velocity the ball leaves the face with, along the aim and up. */
export interface Launch {
  vx: number;
  vy: number;
  vz: number;
}

/** The most speed a mishit of `club` loses at full power: `DISPERSION.loss`, less as the kit has it (the irons' own share too, when a club is told). */
export function lossOf(kit: Kit = NO_KIT, club?: BagClub): number {
  return DISPERSION.loss * kit.loss * (club && isIron(club) ? kit.ironLoss : 1);
}

/** The furthest, in radians, that a swing of `power` from `lie` may miss its aim, either way. */
export function maxScatter(club: BagClub, lie: Lie, power: number, kit: Kit = NO_KIT): number {
  return (
    (club.spread *
      surfaceFor(lie, kit).wild *
      kit.scatter *
      (isIron(club) ? kit.ironScatter : 1) *
      Math.max(0, Math.min(1, power)) *
      Math.PI) /
    180
  );
}

/** A number from minus one to one that is most likely nought, from two draws: bounded, so a limit on it is a fact. */
export function triangle(random: Random): number {
  return random() + random() - 1;
}

/** The furthest, in radians, that a putt of `power` may miss its aim, either way: nought for a kit with no putt scatter. */
export function puttMiss(power: number, kit: Kit = NO_KIT, steady = 1): number {
  if (!(kit.puttScatter > 0)) return 0;
  return (kit.puttScatter * kit.puttScatterScale * steady * Math.max(0, Math.min(1, power)) * Math.PI) / 180;
}

/**
 * The angle a putt of `power` is struck at when it is aimed toward `angle`: the aim, missed by up to `puttMiss`, from two
 * draws of the game's chance (a triangle, as a swing's). A kit with no putt scatter draws none and gives the aim back.
 */
export function puttAngle(angle: number, power: number, random: Random, kit: Kit = NO_KIT, steady = 1): number {
  const miss = puttMiss(power, kit, steady);
  return miss > 0 ? angle + triangle(random) * miss : angle;
}

/** The loft, in degrees, a putt is chipped at: the kit's for every putt, or its sand loft from sand if that is the greater; nought for none. */
export function chipLoft(onSand: boolean, kit: Kit = NO_KIT): number {
  return Math.max(kit.chipAll, onSand ? kit.chipSand : 0);
}

/**
 * The launch of `club` struck at `power` (nought to one) toward `angle` from a ball that lies on `lie`. Four draws
 * of chance, or none for a club with no spread: two for the angle it misses by, and two for the speed it loses, of
 * which half the swings lose nothing.
 */
export function strike(
  club: BagClub,
  power: number,
  angle: number,
  lie: Lie,
  random: Random,
  kit: Kit = NO_KIT,
  steady = 1,
): Launch {
  const surface = surfaceFor(lie, kit);
  const p = Math.max(0, Math.min(1, power));
  let speed = strikeSpeed(p, club.hardest) * surface.power;
  let aim = angle;
  if (club.spread > 0) {
    aim += triangle(random) * maxScatter(club, lie, p, kit) * steady;
    speed *= 1 - Math.max(0, triangle(random)) * lossOf(kit, club) * p;
  }
  // the sand's lip stands the ball up; the putter's loft is none, and stays none
  const loft = club.loft > 0 ? ((loftOf(club, kit) + surface.loft) * Math.PI) / 180 : 0;
  const along = speed * Math.cos(loft);
  return { vx: Math.cos(aim) * along, vy: Math.sin(aim) * along, vz: speed * Math.sin(loft) };
}

/** How far a shot of `power` carries on the level from `lie`, with no scatter: what the aim's marker shows. */
export function carryFrom(club: BagClub, power: number, lie: Lie, kit: Kit = NO_KIT, first = 1): number {
  club = boosted(club, first);
  const surface = surfaceFor(lie, kit);
  const speed = strikeSpeed(Math.max(0, Math.min(1, power)), club.hardest) * surface.power;
  return carrying(speed, club.loft > 0 ? loftOf(club, kit) + surface.loft : 0);
}
