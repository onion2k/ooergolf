/**
 * What the three desert courses' tests share, said once: the holes as made, the counts read off them, and the rules that
 * hold for a hole of any of them. A pan is a hole's lake in the desert (`d` on the map, ground a ball skitters across and is
 * never lost in), a cactus is its tree (`^`), and a name draws a wind of its own, which has to move the grass.
 */
import { MAX_BEND, bend } from 'artshape-render/game/grass';
import { expect } from 'vitest';
import { layoutOf, lieAt, type Layout } from '../src/arena';
import { BADLANDS_SPECS } from '../src/badlands';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { golfHole, type GolfSpec, type Lane } from '../src/golf';
import { MESA_SPECS } from '../src/mesa';
import { terrainRefusal } from '../src/physics';
import { Route } from '../src/route';
import { SALTPAN_SPECS } from '../src/saltpan';
import { LIE } from '../src/surfaces';
import { KINDS, ROUGH, windOf } from '../src/turf';
import { DT, golfGame } from './helpers';

/** The three courses by name, each with its specs, so a rule is asked of all of them and a name of the other two. */
export const DESERT = {
  'The Saltpan': SALTPAN_SPECS,
  'The Mesa': MESA_SPECS,
  'The Badlands': BADLANDS_SPECS,
} as const satisfies Record<string, readonly GolfSpec[]>;

export type DesertName = keyof typeof DESERT;

/** A course's holes, made, with their layouts: what a hole is as the game has it. */
export function madeOf(specs: readonly GolfSpec[]): { holes: HoleDef[]; layouts: Layout[]; ms: number } {
  const t0 = performance.now();
  const holes = specs.map((s) => golfHole(s));
  const ms = performance.now() - t0;
  return { holes, layouts: holes.map((h) => layoutOf(h.map, h.terrain, h.way, h.biome)), ms };
}

/** Tiles of a map that are one of `chars`. */
export function tiles(map: readonly string[], chars: string): number {
  let n = 0;
  for (const row of map) for (const c of row) if (chars.includes(c)) n++;
  return n;
}

/** The names of every hole of every course the game has, and of the three desert courses beside them. */
export function takenNames(except: DesertName): string[] {
  return [
    ...COURSES.flatMap((c) => c.holes.map((h) => h.name)),
    ...Object.entries(DESERT)
      .filter(([n]) => n !== except)
      .flatMap(([, specs]) => specs.map((s) => s.name)),
  ];
}

/**
 * The rule of `test/turf.test.ts` for a name's wind, asked of a name that is not yet a hole of any course: it blows hard enough
 * (0.7 to 1 of the most) and bends the grass a good way across the ground at one moment (0.4 radians) and at one place over a few
 * seconds (0.3), and never past the renderer's most.
 */
export function windProblems(name: string): string[] {
  const problems: string[] = [];
  const give = KINDS[ROUGH].give ?? 1;
  const w = windOf(name);
  if (!(w.strength >= 0.7 && w.strength <= 1)) problems.push(`${name}: wind strength ${w.strength}`);
  let across = 0;
  for (let t = 0; t < 20; t += 1.7) {
    let lo = Infinity,
      hi = -Infinity;
    for (let x = 0; x < 16; x += 0.5)
      for (let y = 0; y < 16; y += 0.5) {
        const b = bend(give, w, x, y, t, 0);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
    across = Math.max(across, hi - lo);
  }
  if (across < 0.4) problems.push(`${name}: ripples across the ground ${across.toFixed(3)} radians, under 0.4`);
  let lo = Infinity,
    hi = -Infinity;
  for (let t = 0; t < 6; t += 0.05) {
    const b = bend(give, w, 5, 5, t, 0.3);
    lo = Math.min(lo, b);
    hi = Math.max(hi, b);
  }
  if (hi - lo < 0.3) problems.push(`${name}: sway at a place ${(hi - lo).toFixed(3)} radians, under 0.3`);
  if (hi >= MAX_BEND) problems.push(`${name}: bent past the most, ${hi.toFixed(3)}`);
  return problems;
}

/** What every hole of a desert course must be, asked once for a hole and its layout: ground the physics takes, a way to the cup, a cup on a green and a tee on a tee, in the desert, with no water and no trees but cacti. */
export function holeProblems(hole: HoleDef, layout: Layout): void {
  expect(hole.biome, hole.name).toBe('desert');
  expect(layout.biome, hole.name).toBe('desert');
  expect(layout.golf, hole.name).toBe(true);
  expect(terrainRefusal(layout, CUP), hole.name).toBeNull();
  expect(lieAt(layout, layout.cup.x, layout.cup.y), hole.name).toBe(LIE.green);
  expect(lieAt(layout, layout.tee.x, layout.tee.y), hole.name).toBe(LIE.tee);
  expect(Number.isFinite(new Route(layout).distance(layout.tee.x, layout.tee.y)), hole.name).toBe(true);
  // a desert's lake is a pan: no tile of the map is water, whatever the spec asked for
  expect(tiles(hole.map, '~'), `${hole.name}: water`).toBe(0);
  expect(tiles(hole.map, '^'), `${hole.name}: cacti`).toBe(layout.trees.length);
}

/**
 * A driver struck true down a hole's lane in a still air (a wind of fifteen miles an hour takes a drive off a lane eight yards
 * wide, which is the desert's and not the lane's fault), and what happened: the cacti it knocked on the way up, whether it was
 * lost, where it first came down and how far that is from the tee.
 */
export function driveLane(hole: HoleDef, lane: Lane) {
  const still: HoleDef = { ...hole, wind: 0 };
  const { game, calls } = golfGame(still);
  game.pick('driver');
  game.shoot(Math.atan2(lane.to.y - lane.from.y, lane.to.x - lane.from.x), 1);
  for (let f = 0; f < 60 * 20; f++) {
    game.step(DT);
    if (f > 1 && game.ready) break;
  }
  const first = calls.findIndex(([n, a]) => n === 'landed' && a[3] === true);
  const before = first < 0 ? calls : calls.slice(0, first);
  const at = first < 0 ? null : { x: calls[first][1][0] as number, y: calls[first][1][1] as number };
  return {
    knocks: before.filter(([n]) => n === 'knocked').length,
    lost: calls.some(([n]) => n === 'outOfBounds' || n === 'splash'),
    at,
    carry: at ? Math.hypot(at.x - lane.from.x, at.y - lane.from.y) : 0,
  };
}

/** How far the nearest cactus stands from a lane's line past what the lane keeps clear: nought or more where the lane is clear. */
export function laneRoom(layout: Layout, lane: Lane): number {
  const dx = lane.to.x - lane.from.x,
    dy = lane.to.y - lane.from.y;
  const len2 = dx * dx + dy * dy;
  let least = Infinity;
  for (const t of layout.trees) {
    const u = Math.max(0, Math.min(1, ((t.x - lane.from.x) * dx + (t.y - lane.from.y) * dy) / len2));
    least = Math.min(least, Math.hypot(t.x - (lane.from.x + u * dx), t.y - (lane.from.y + u * dy)));
  }
  return least - lane.keep;
}
