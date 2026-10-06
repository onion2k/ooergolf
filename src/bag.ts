/**
 * The bag: the clubs a golf hole is played with, content. A club is a loft and the fastest it launches a ball; the
 * player's drag sets how much of that speed it strikes with, and the club fixes the loft, so a drag is a direction
 * and a power as it is with the putter, and choosing a club is choosing the shot. Nothing in the bag is bought: it is
 * all there from the start, and the shop sells what it sold (the minigolf putters).
 *
 * A unit is a yard, so a real bag's distances are these numbers: the driver carries about 250, a seven iron 150 and
 * a pitching wedge 100. The speeds are worked out from the carry formula at the physics' gravity (a ball flung at
 * a loft goes speed squared times the sine of twice the loft over gravity, which the tests hold the game to) and then
 * measured in the game, since a landing on real ground is not the formula's.
 */
import { HARDEST_SHOT, PHYSICS, strikeSpeed } from './arena';
import { ITEM_FIGURES } from './items';

export interface BagClub {
  id: string;
  name: string;
  /** What the picker says: two or three characters. */
  label: string;
  /** The loft, in degrees: how steeply it launches. Nought is the putter's, along the ground. */
  loft: number;
  /** The hardest it launches a ball, in units a second, along the line of the loft. */
  hardest: number;
  /** How far a full swing may miss its aim, in degrees, at most: the putter is the player's own aim. */
  spread: number;
}

export const BAG: readonly BagClub[] = [
  { id: 'driver', name: 'Driver', label: 'Dr', loft: 11, hardest: 216, spread: 5 },
  { id: '3-wood', name: '3-wood', label: '3W', loft: 14, hardest: 185, spread: 4.5 },
  { id: '5-iron', name: '5-iron', label: '5i', loft: 27, hardest: 123, spread: 3.5 },
  { id: '7-iron', name: '7-iron', label: '7i', loft: 34, hardest: 106, spread: 3 },
  { id: '9-iron', name: '9-iron', label: '9i', loft: 42, hardest: 92, spread: 2.5 },
  { id: 'pitching-wedge', name: 'Pitching wedge', label: 'PW', loft: 46, hardest: 84, spread: 2 },
  { id: 'sand-wedge', name: 'Sand wedge', label: 'SW', loft: 56, hardest: 78, spread: 2 },
  { id: 'putter', name: 'Putter', label: 'Pt', loft: 0, hardest: HARDEST_SHOT, spread: 0 },
];

/** The putter: the last club in the bag, which strikes as the minigolf's starting putter does. */
export const PUTTER = BAG[BAG.length - 1];

/** A club by its id, or the driver for one that is not in the bag. */
export function bagClub(id: string): BagClub {
  return BAG.find((c) => c.id === id) ?? BAG[0];
}

/**
 * How far a ball flung at `speed` and `loft` degrees carries on the level before it comes down, ignoring the ground
 * under it and the air round it, which the game does not have. The one formula: the strike's lies and the aim's marker
 * work from it, and the tests hold the game's own flight to it.
 */
export function carrying(speed: number, loft: number): number {
  return (speed * speed * Math.sin((2 * loft * Math.PI) / 180)) / PHYSICS.gravity;
}

/** How far the club carries with `power` of the drag: in proportion to it, as a putt rolls in proportion to it. */
export function carryOf(club: BagClub, power: number): number {
  return carrying(strikeSpeed(power, club.hardest), club.loft);
}

/** The gloved copies made, one a club: a club is gloved on every read, and a copy made each time would be made every frame. */
const GLOVED = new WeakMap<BagClub, BagClub>();

/** `club` as the power glove has it, every figure as it was but its hardest: the same copy each time it is asked for. */
export function gloved(club: BagClub): BagClub {
  let g = GLOVED.get(club);
  if (!g) {
    g = { ...club, hardest: club.hardest * ITEM_FIGURES.glove.hardest };
    GLOVED.set(club, g);
  }
  return g;
}
