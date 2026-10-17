/**
 * The caddie: a word of advice when a golf ball comes to rest, so a player sees what the clubs and a draw or a fade are
 * for. It asks what a player most likely does next, the club in hand struck straight at full power the way the camera has
 * turned (the line of play), and when that goes wrong and another choice does not, it says both: what happens, and what to
 * do instead, with the club and the shape that does it.
 *
 * Every word it says is a preview, the game's own physics struck true, so a tip is never a guess: the shot it offers was
 * tried and came down clear. The planner the autopilot uses would choose better shots, but it costs 49 ms a shot on average
 * and 233 at worst, which a page cannot spend in a frame; a preview is about 2 ms, and the caddie spends at most one a step
 * (`step`) and `CADDIE.previews` a look, so the page spreads them over the frames after the ball comes to rest.
 *
 * It reads the game and changes nothing of it: its previewer has a rehearsal of its own, made with the hole and let go with
 * it, and no chance is drawn. It holds a fixed set of numbers and one tip, never a list.
 */
import { lieAt } from './arena';
import { BAG, type BagClub } from './bag';
import { carryFrom } from './flight';
import type { Game } from './game';
import { PLAY_AHEAD, lookAlong } from './lineofplay';
import { GHOST_FRAMES, Previewer, type Preview } from './preview';
import { LIE, SURFACES } from './surfaces';

export const CADDIE = {
  /** The most previews a look may take: the club in hand, a draw and a fade, and three clubs to lay up with. */
  previews: 6,
  /** How far past the pin, in yards, the club in hand must carry at full power before a shorter club is offered. */
  past: 25,
  /** How many shots that took a kind of tip a player strikes before that kind is said no more unless asked for. */
  taken: 3,
  /**
   * The least share of the distance a shot is to make that its tip's shot must carry: a shot that comes down clear because it
   * struck a hillside thirty yards out is no advice (The Fells' Plunge had "a full 3-wood carries 26" before this).
   */
  progress: 0.75,
  /** The most flights the look at spin takes, after the look at the club and the shape: flat, back and top. */
  spins: 3,
  /**
   * How many frames of a roll to where the ball rests the caddie runs in one step: a rest is up to 1,500 frames of the
   * rehearsal, 4 ms on average and 52 ms at worst in one go (16 October 2026), so it is run 60 frames, about 2 ms, a frame.
   */
  slice: 60,
  /** How many yards nearer the pin a spin must leave the ball before it is offered for that alone. */
  nearer: 10,
} as const;

/** What goes wrong with a shot: it comes down in the water, out of bounds or in the sand, or a tree or the rail knocks it in the air. */
export type Trouble = 'water' | 'out' | 'sand' | 'tree';

export type TipKind = 'shape' | 'club' | 'spin';

/**
 * A tip: the club, the shape and the spin to strike it with, the way it was tried, the words, and what its button says. A tip
 * of a club or a shape may carry a spin as well; a tip of spin is the club and shape in hand with a spin put on.
 */
export interface Tip {
  kind: TipKind;
  /** The club of the bag to take, the shape to strike it with (-1 a draw, 0 straight, 1 a fade) and the spin (-1 back, 0 flat, 1 top). */
  club: string;
  shape: number;
  spin: number;
  /** The way the tip's shot was tried, as an angle from +x toward +y, and how far it comes down from the ball, in yards. */
  angle: number;
  carry: number;
  text: string;
  button: string;
}

/** What went wrong with a preview, or null for a shot that came down clear (or dropped in the cup). */
export function troubleOf(p: Preview): Trouble | null {
  if (p.end === 'water') return 'water';
  if (p.end === 'out') return 'out';
  if (p.hit) return 'tree';
  if (p.end === 'landed' && p.lie === LIE.sand) return 'sand';
  return null;
}

/** The trouble in words, after the club's name: "finds the water at 240 yd". */
function troubleWords(trouble: Trouble, yards: number): string {
  const at = `${Math.round(yards)} yd`;
  switch (trouble) {
    case 'water':
      return `finds the water at ${at}`;
    case 'out':
      return `goes out of bounds at ${at}`;
    case 'sand':
      return `finds the sand at ${at}`;
    case 'tree':
      return `hits a tree ${at} out`;
  }
}

const SHAPE_NAME = { [-1]: 'draw', 0: 'straight', 1: 'fade' } as Record<number, string>;

/** Where a shot comes down, as a golfer says it: in the rough, on the fairway. */
function onGround(p: Preview): string {
  if (p.end === 'holed') return 'in the cup';
  const name = SURFACES[p.lie]?.name ?? 'ground';
  return `${p.lie === LIE.rough || p.lie === LIE.sand ? 'in' : 'on'} the ${name}`;
}

/** A club's name in the middle of a sentence: "the 9-iron", "the pitching wedge". */
const lower = (club: BagClub) => club.name.toLowerCase();

type Phase = 'idle' | 'start' | 'shapes' | 'layup' | 'reach' | 'spin' | 'done';

/** The spins the look at spin tries, in turn: flat first, which the other two are measured against. */
const SPINS = [0, -1, 1] as const;

/** Whether a rest is somewhere to play from at all: in the cup, or at rest out of the water, out of bounds and the sand. */
function restOk(p: Preview): boolean {
  const r = p.rest;
  return r.end === 'holed' || (r.end === 'rest' && r.lie !== LIE.sand);
}

/** Whether a rest is a good one: in the cup, or at rest on the fairway, the first cut, the green or the tee, and not the rough. */
function restGood(p: Preview): boolean {
  const r = p.rest;
  return (
    r.end === 'holed' ||
    (r.end === 'rest' && (r.lie === LIE.fairway || r.lie === LIE.cut || r.lie === LIE.green || r.lie === LIE.tee))
  );
}

/** What a flat roll does after it lands, in words: "runs into the water", or "runs off it" for one that lands on the green and leaves it. */
function runsOff(end: string, lie: number): string {
  if (end === 'water') return 'runs into the water';
  if (end === 'out') return 'runs out of bounds';
  if (lie === LIE.sand) return 'runs into the sand';
  return 'runs off it';
}

/** Where a rest is, as a golfer says it: in the rough, on the fairway, in the cup. */
function restGround(p: { end: string; lie: number }): string {
  if (p.end === 'holed') return 'in the cup';
  const name = SURFACES[p.lie]?.name ?? 'ground';
  return `${p.lie === LIE.rough || p.lie === LIE.sand ? 'in' : 'on'} the ${name}`;
}

/** The caddie of one golf hole: made with it, as the page makes its previewer, and let go with it. */
export class Caddie {
  /** The tip of the last look, null for none (or none yet: see `done`). */
  tip: Tip | null = null;
  /** How many previews the look under way has spent. */
  previews = 0;
  private phase: Phase = 'idle';
  private readonly previewer: Previewer;
  private readonly from = { x: 0, y: 0 };
  private readonly look = { x: 0, y: 0 };
  /** The way the club in hand is tried (the line of play), and the cup's way and distance. */
  private heading = 0;
  private cupHeading = 0;
  private cupYards = 0;
  private inHand: BagClub = BAG[0];
  private shape = 0;
  /** The next shape or club to try, as a shape (-1, 0, 1) or an index into the bag. */
  private next = 0;
  /** What went wrong with the club in hand, and how far out. */
  private trouble: Trouble = 'water';
  private troubleYards = 0;
  /** The best shape found so far, and how far from the cup it comes down. */
  private bestShape = NaN;
  private bestMiss = Infinity;
  private bestCarry = 0;
  /** How far the club in hand carries at full power, by the arithmetic, for the words of a club that reaches. */
  private handCarry = 0;
  /** How many clubs the reach has tried. */
  private reachTried = 0;
  /** The spin in hand when the look began, and whether the shot the look settled on is one to put a spin on (it came down clear). */
  private spin = 0;
  private spinnable = false;
  /** The look at spin: the shot it spins, which spin it is on, whether a rest is being run, and what each spin came to. */
  private readonly base = { club: BAG[0], angle: 0, shape: 0 };
  private spinAt = 0;
  private resting = false;
  private readonly spun: Spun = {
    ok: [false, false, false],
    good: [false, false, false],
    miss: new Float64Array(3),
    landedOnGreen: false,
    flatEnd: 'rest',
    flatLie: 0,
    restLie: [0, 0, 0],
    holed: [false, false, false],
    restYards: new Float64Array(3),
  };

  constructor(private readonly game: Game) {
    this.previewer = new Previewer(game, { rest: false });
  }

  /** Whether the look under way has finished (or none was begun), so `tip` is its answer. */
  get done(): boolean {
    return this.phase === 'done' || this.phase === 'idle';
  }

  /**
   * Begin a look from where the ball lies, with the club and shape in hand: nothing on a hole of minigolf, with the ball not
   * ready, on the putting green or with the putter in hand. The work is done by `step`, a preview at a time.
   */
  begin() {
    const { game } = this;
    this.tip = null;
    this.previews = 0;
    this.phase = 'done';
    this.spinnable = this.resting = false;
    const { layout, world, ball } = game;
    if (!layout.golf || !game.ready || game.phase !== 'play') return;
    const x = world.x[ball],
      y = world.y[ball];
    if (lieAt(layout, x, y) === LIE.green || !(game.inHand.loft > 0)) return;
    this.from.x = x;
    this.from.y = y;
    this.inHand = BAG.find((c) => c.id === game.inHand.id) ?? BAG[0];
    this.shape = Math.sign(game.shape);
    this.spin = Math.sign(game.spin);
    const { cup } = layout;
    this.cupHeading = Math.atan2(cup.y - y, cup.x - x);
    this.cupYards = Math.hypot(cup.x - x, cup.y - y);
    this.heading = lookAlong(layout.way, x, y, PLAY_AHEAD, this.look, cup)
      ? Math.atan2(this.look.y - y, this.look.x - x)
      : this.cupHeading;
    this.handCarry = carryFrom(this.inHand, 1, lieAt(layout, x, y), game.kit);
    this.phase = 'start';
  }

  /** One step of the look: at most one preview. Whether the look is done. */
  step(): boolean {
    switch (this.phase) {
      case 'start':
        this.started();
        break;
      case 'shapes':
        this.shapes();
        break;
      case 'layup':
        this.layUp();
        break;
      case 'reach':
        this.reach();
        break;
      case 'spin':
        this.spins();
        return this.done;
      case 'done':
      case 'idle':
        break;
    }
    if (this.previews >= CADDIE.previews && !this.done) this.phase = 'done';
    // the club and the shape settled, the shot they came to is looked at again for its spin, if it came down clear
    if (this.phase === 'done' && this.spinnable) this.startSpin();
    return this.done;
  }

  /** A whole look at once, for a test or the fuzzer: `begin` and every `step`. */
  advise(): Tip | null {
    this.begin();
    while (!this.step());
    return this.tip;
  }

  /** The first step: a shorter club where the club in hand flies the pin, and otherwise the club in hand tried. */
  private started() {
    const lie = lieAt(this.game.layout, this.from.x, this.from.y);
    if (this.handCarry > this.cupYards + CADDIE.past) {
      // the shortest club that carries to the pin at full power; none shorter than the one in hand, no tip
      const hand = BAG.indexOf(this.inHand);
      let pick = -1;
      for (let k = BAG.length - 1; k > hand; k--) {
        const c = BAG[k];
        if (c.loft > 0 && carryFrom(c, 1, lie, this.game.kit) >= this.cupYards) {
          pick = k;
          break;
        }
      }
      if (pick > hand) {
        this.next = pick;
        this.reachTried = 0;
        this.phase = 'reach';
        this.reach();
        return;
      }
    }
    const p = this.run(this.inHand, this.heading, this.shape);
    const trouble = troubleOf(p);
    if (!trouble) {
      this.spinnable = true;
      this.phase = 'done';
      return;
    }
    this.trouble = trouble;
    this.troubleYards =
      trouble === 'tree' && p.hit ? Math.hypot(p.hit.x - this.from.x, p.hit.y - this.from.y) : p.carry;
    this.bestShape = NaN;
    this.bestMiss = Infinity;
    this.next = -1;
    this.phase = 'shapes';
  }

  /** A draw, straight or a fade of the club in hand, whichever is not in hand, one a step; the clear one nearest the cup is the tip. */
  private shapes() {
    while (this.next <= 1 && this.next === this.shape) this.next++;
    if (this.next > 1) {
      if (Number.isNaN(this.bestShape)) {
        this.next = BAG.indexOf(this.inHand) + 1;
        this.phase = 'layup';
      } else {
        const s = this.bestShape;
        const fix = s === 0 ? 'Hit it straight and it stays clear.' : `A ${SHAPE_NAME[s]} bends it clear.`;
        this.spinnable = true;
        this.tip = {
          kind: 'shape',
          club: this.inHand.id,
          shape: s,
          spin: 0,
          angle: this.heading,
          carry: this.bestCarry,
          text: `${this.inHand.name} ${troubleWords(this.trouble, this.troubleYards)}. ${fix}`,
          button: s === 0 ? 'Hit it straight' : `Try a ${SHAPE_NAME[s]}`,
        };
        this.phase = 'done';
      }
      return;
    }
    const s = this.next++;
    const p = this.run(this.inHand, this.heading, s);
    if (troubleOf(p) || p.carry < this.troubleYards * CADDIE.progress) return;
    const miss = Math.hypot(p.x - this.game.layout.cup.x, p.y - this.game.layout.cup.y);
    if (miss < this.bestMiss) {
      this.bestMiss = miss;
      this.bestShape = s;
      this.bestCarry = p.carry;
    }
  }

  /** The clubs shorter than the one in hand, struck straight at full power, one a step: the first that comes down clear is the tip. */
  private layUp() {
    while (this.next < BAG.length && !(BAG[this.next].loft > 0)) this.next++;
    if (this.next >= BAG.length) {
      this.phase = 'done';
      return;
    }
    const club = BAG[this.next++];
    const p = this.run(club, this.heading, 0);
    // a lay-up comes down short of the trouble, and so is held to the shorter share of it
    if (troubleOf(p) || p.carry < (this.troubleYards * CADDIE.progress) / 1.5) return;
    const where = onGround(p);
    this.spinnable = true;
    this.tip = {
      kind: 'club',
      club: club.id,
      shape: 0,
      spin: 0,
      angle: this.heading,
      carry: p.carry,
      text: `${this.inHand.name} ${troubleWords(this.trouble, this.troubleYards)}. The ${lower(club)} lays up at ${Math.round(p.carry)} yd ${where}.`,
      button: `Take the ${lower(club)}`,
    };
    this.phase = 'done';
  }

  /** The club that carries to the pin at full power, at the pin, and the next longer if it comes down in trouble: twice at most. */
  private reach() {
    const hand = BAG.indexOf(this.inHand);
    if (this.next <= hand || this.reachTried >= 2) {
      this.phase = 'done';
      return;
    }
    const club = BAG[this.next--];
    this.reachTried++;
    const p = this.run(club, this.cupHeading, 0);
    if (troubleOf(p) || (p.end !== 'holed' && p.carry < this.cupYards * CADDIE.progress)) return;
    this.spinnable = true;
    this.tip = {
      kind: 'club',
      club: club.id,
      shape: 0,
      spin: 0,
      angle: this.cupHeading,
      carry: p.carry,
      text: `${this.inHand.name} carries ${Math.round(this.handCarry)}, and the pin is ${Math.round(this.cupYards)} yd. A full ${lower(club)} ${p.end === 'holed' ? 'drops in the cup' : `carries ${Math.round(p.carry)}`}.`,
      button: `Take the ${lower(club)}`,
    };
    this.phase = 'done';
  }

  /** A preview of `club` at full power along `angle` with `shape` and `spin`, counted. */
  private run(club: BagClub, angle: number, shape: number, spin = 0): Preview {
    this.previews++;
    return this.previewer.run(this.from, club, angle, 1, shape, spin);
  }

  /** The look at spin begun, on the tip's shot if there is one and the club in hand's otherwise. */
  private startSpin() {
    this.spinnable = false;
    const tip = this.tip;
    this.base.club = tip ? (BAG.find((c) => c.id === tip.club) ?? this.inHand) : this.inHand;
    this.base.angle = tip ? tip.angle : this.heading;
    this.base.shape = tip ? tip.shape : this.shape;
    this.spinAt = 0;
    this.resting = false;
    this.phase = 'spin';
  }

  /**
   * One step of the look at spin: a flight of the next spin, or a slice of the roll to where it rests, never both, so a
   * step costs about what a preview of a drag does; and once all three are in, the spin chosen.
   */
  private spins() {
    const p = this.previewer.result;
    if (!this.resting) {
      const s = SPINS[this.spinAt];
      this.run(this.base.club, this.base.angle, this.base.shape, s);
      if (this.spinAt === 0) {
        this.spun.landedOnGreen = p.end === 'landed' && p.lie === LIE.green;
      }
      this.resting = !this.previewer.beginRest(p, this.from);
      if (this.resting) return;
    } else if (!this.previewer.stepRest(CADDIE.slice)) return;
    this.resting = false;
    const k = this.spinAt++;
    const r = p.rest;
    this.spun.ok[k] = restOk(p);
    this.spun.good[k] = restGood(p);
    this.spun.holed[k] = r.end === 'holed';
    this.spun.restLie[k] = r.lie;
    this.spun.restYards[k] = r.carry;
    const { cup } = this.game.layout;
    this.spun.miss[k] = r.end === 'holed' ? 0 : Math.hypot(r.x - cup.x, r.y - cup.y);
    if (k === 0) {
      this.spun.flatEnd = r.end;
      this.spun.flatLie = r.lie;
    }
    if (this.spinAt < SPINS.length) return;
    this.chooseSpin();
    this.phase = 'done';
  }

  /**
   * The spin the look found best, and the tip it makes: back spin where a shot that lands on the green would roll off it and
   * back spin holds it, and otherwise whichever of back and top leaves the ball at a good rest `CADDIE.nearer` yards nearer the
   * pin than flat does (or at a good rest where flat leaves it in the sand or worse). Added to the tip there is, or a tip of
   * its own for the club and shape in hand.
   */
  private chooseSpin() {
    const { spun } = this;
    const best = bestSpin(spun);
    const holdsGreen = (k: number) => spun.holed[k] || (spun.good[k] && spun.restLie[k] === LIE.green);
    const tip = this.tip;
    if (best === 0) {
      // a tip whose ball, struck flat, rolls on into the water, out of bounds or the sand, and that no spin saves, is no tip
      if (tip && !spun.ok[0]) this.tip = null;
      return;
    }
    const k = best < 0 ? 1 : 2;
    const club = this.base.club;
    const it = tip ? 'it' : `the ${lower(club)}`;
    const stops = spun.holed[k] ? 'drops it in the cup' : `stops it ${Math.round(spun.miss[k])} yd from the pin`;
    const name = best < 0 ? 'back spin' : 'top spin';
    const Name = best < 0 ? 'Back spin' : 'Top spin';
    const rest = { end: spun.holed[k] ? 'holed' : 'rest', lie: spun.restLie[k] };
    let said: string;
    if (best < 0 && spun.landedOnGreen && !holdsGreen(0))
      said = `${tip ? 'It' : `The ${lower(club)}`} lands on the green and ${runsOff(spun.flatEnd, spun.flatLie)}. Back spin ${stops}.`;
    else if (!spun.ok[0])
      said = `Struck flat, ${it} ${runsOff(spun.flatEnd, spun.flatLie)}. ${Name} keeps it ${restGround(rest)}, ${Math.round(spun.miss[k])} yd from the pin.`;
    else if (best < 0) said = `Back spin ${stops}, ${Math.round(spun.miss[0] - spun.miss[k])} yd nearer.`;
    else
      said = `Top spin runs ${it} on to ${Math.round(spun.restYards[k])} yd, ${spun.holed[k] ? 'in the cup' : `${Math.round(spun.miss[k])} yd from the pin`}.`;
    if (tip) {
      tip.spin = best;
      tip.text = `${tip.text} ${said}`;
      tip.button = `${tip.button} with ${name}`;
      return;
    }
    // a spin already in hand is not offered again
    if (best === this.spin) return;
    this.tip = {
      kind: 'spin',
      club: club.id,
      shape: this.base.shape,
      spin: best,
      angle: this.base.angle,
      carry: this.previewer.result.carry,
      text: said,
      button: `Add ${name}`,
    };
  }

  /**
   * The tip's own shot tried again, from where the ball lies, carried on to where it rests when the tip has a spin: what
   * `caddieProblems` holds it to. Run in one go, so it is for a test and the fuzzer, never a frame.
   */
  retry(tip: Tip): Preview {
    const p = this.previewer.run(
      this.from,
      BAG.find((c) => c.id === tip.club) ?? BAG[0],
      tip.angle,
      1,
      tip.shape,
      tip.spin,
    );
    if (tip.spin !== 0 && !this.previewer.beginRest(p, this.from)) while (!this.previewer.stepRest(GHOST_FRAMES));
    return p;
  }

  /** How many bodies its rehearsal has: the one ball. */
  get bodies(): number {
    return this.previewer.bodies;
  }
}

/**
 * Whether a shot struck with `club`, `shape` and `spin` took `tip`: the tip's club, for a tip of shape its shape too, and for a
 * tip of spin its spin.
 */
export function tookTip(tip: Tip, club: string, shape: number, spin = 0): boolean {
  if (club !== tip.club) return false;
  if (tip.kind === 'shape') return Math.sign(shape) === tip.shape;
  if (tip.kind === 'spin') return Math.sign(spin) === tip.spin;
  return true;
}

/**
 * What each of the three spins, flat, back and top in that order, came to: whether its rest is somewhere to play from (`ok`) and
 * a good lie (`good`), whether it dropped, what it rests on, how far from the pin, and how far from the ball; and whether the flat
 * shot first came down on the putting green, and how its roll ended.
 */
export interface Spun {
  ok: boolean[];
  good: boolean[];
  miss: Float64Array;
  landedOnGreen: boolean;
  flatEnd: string;
  flatLie: number;
  restLie: number[];
  holed: boolean[];
  restYards: Float64Array;
}

/**
 * The spin to offer, from what flat, back and top came to: back spin where a shot that lands on the green rolls off it and back
 * spin holds it there, at any gain; and otherwise whichever of back and top comes to a good rest (the fairway, the cut, the green
 * or the tee, or the cup) `CADDIE.nearer` yards nearer the pin than flat, the more, or which keeps out of the trouble flat rolls
 * into. Nought for none.
 */
export function bestSpin(spun: Spun): number {
  const holdsGreen = (k: number) => spun.holed[k] || (spun.good[k] && spun.restLie[k] === LIE.green);
  if (spun.landedOnGreen && !holdsGreen(0) && holdsGreen(1)) return -1;
  let best = 0,
    gain = -Infinity;
  for (const k of [1, 2]) {
    if (!spun.good[k]) continue;
    // a spin that keeps out of the trouble flat rolls into is worth it at any distance; otherwise it must gain the yards
    const g = spun.ok[0] ? spun.miss[0] - spun.miss[k] : CADDIE.nearer + 1e6 - spun.miss[k];
    if (g >= CADDIE.nearer && g > gain) {
      gain = g;
      best = SPINS[k];
    }
  }
  return best;
}

/** Whether a kind of tip is said without being asked for: until the player has taken `CADDIE.taken` of it. */
export function speaks(kind: TipKind, taken: Readonly<Record<TipKind, number>>): boolean {
  return taken[kind] < CADDIE.taken;
}

/** What the caddie says when asked and has nothing to change: the club in hand is fine from where the ball lies. */
export function fineText(club: string): string {
  return `Nothing to change: the ${club.toLowerCase()} is fine from here.`;
}

/**
 * When the caddie speaks, for the page and the fuzzer alike: a look begun when a ball comes to rest and again when the club or
 * the shape in hand changes, a preview a frame, and the tip said once a shot of its own accord, while the player has taken
 * fewer than `CADDIE.taken` of its kind, and otherwise only when asked. A tip put away is not said again for that shot unless
 * asked for. It holds a fixed set of numbers, the caddie of the hole and the tip offered, never a list.
 */
export class CaddieTalk {
  /** What is said now: the words and the button's (null for an answer with nothing to press), or null for nothing. */
  readonly said: { text: string | null; button: string | null } = { text: null, button: null };
  /** The tip said for this shot, which a stroke that takes it counts: kept when it is put away or taken, until the next shot. */
  offered: Tip | null = null;
  private caddie: Caddie | null = null;
  /**
   * Where the ball lay, what was in hand and the kit worn when the look was begun, so a new one is begun when any of them
   * changes: a kit put on changes how far a club goes, and a tip worked out with the last one may not hold (the fuzzer found a
   * 3-wood offered with no item that met a tree once the Titanium Driver was worn).
   */
  private readonly at = { x: NaN, y: NaN, club: '', shape: NaN, spin: NaN, kitClub: '', kitBall: '', kitAccessory: '' };
  /** Whether a tip was said of its own accord for this shot, put away, or asked for. */
  private voiced = false;
  private dismissed = false;
  private asked = false;

  /** The caddie of the hole begun: one for a golf hole, made with it as the previewer is, and none for a hole of minigolf. */
  hole(game: Game | null) {
    this.caddie = game && game.layout.golf ? new Caddie(game) : null;
    this.newShot();
    this.at.x = NaN;
  }

  /** How many previews the look under way has spent, and whether it is done: for the tests. */
  get looking(): { previews: number; done: boolean } {
    return { previews: this.caddie?.previews ?? 0, done: this.caddie?.done ?? true };
  }

  /** The hole's caddie, for the fuzzer to hold a tip's shot to: none on minigolf. */
  get own(): Caddie | null {
    return this.caddie;
  }

  /**
   * A frame: a look begun if the ball has come to rest somewhere new or the club or shape in hand changed, a preview of it
   * spent, and what is said settled. `quiet` is nothing said at all (the start screen, the title); `taken` the save's counts.
   */
  frame(game: Game, taken: Readonly<Record<TipKind, number>>, quiet = false) {
    const caddie = this.caddie;
    if (!caddie || quiet || !game.ready || game.phase !== 'play') {
      this.say(null);
      return;
    }
    const { world, ball } = game;
    const x = world.x[ball],
      y = world.y[ball];
    const club = game.inHand.id,
      shape = Math.sign(game.shape),
      spin = Math.sign(game.spin);
    if (x !== this.at.x || y !== this.at.y) this.newShot();
    const { at } = this,
      slots = game.slots;
    if (
      x !== at.x ||
      y !== at.y ||
      club !== at.club ||
      shape !== at.shape ||
      spin !== at.spin ||
      slots.club !== at.kitClub ||
      slots.ball !== at.kitBall ||
      slots.accessory !== at.kitAccessory
    ) {
      at.x = x;
      at.y = y;
      at.club = club;
      at.shape = shape;
      at.spin = spin;
      at.kitClub = slots.club;
      at.kitBall = slots.ball;
      at.kitAccessory = slots.accessory;
      caddie.begin();
    }
    if (!caddie.done) caddie.step();
    if (!caddie.done) return;
    const tip = caddie.tip;
    if (this.asked) {
      if (tip) this.offer(tip);
      else this.say(fineText(game.inHand.name));
      return;
    }
    const same =
      tip !== null &&
      this.offered !== null &&
      tip.club === this.offered.club &&
      tip.shape === this.offered.shape &&
      tip.spin === this.offered.spin;
    if (tip && !this.dismissed && speaks(tip.kind, taken) && (!this.voiced || same)) {
      this.voiced = true;
      this.offer(tip);
    } else this.say(null);
  }

  /** The Caddie button: the tip said whatever the counts, or that the club is fine; and said again after it was put away. */
  ask() {
    this.asked = true;
    this.dismissed = false;
  }

  /** The ✕: the tip put away for this shot. */
  close() {
    this.dismissed = true;
    this.asked = false;
    this.say(null);
  }

  /**
   * The tip's button: its club, shape and spin put in hand, as the bag's buttons would, and the tip said no more. Whether
   * there was a tip to take. What is in hand has changed, so a new look begins next frame, and `frame` says nothing while a
   * look runs: put away here, the tip is gone at once, and not left up for the frames a look at spin takes.
   */
  take(game: Game): boolean {
    const tip = this.offered;
    if (!tip || this.said.text === null || this.said.button === null) return false;
    if (!game.pick(tip.club)) return false;
    game.setShape(tip.shape);
    game.setSpin(tip.spin);
    this.asked = false;
    this.say(null);
    return true;
  }

  /** A stroke struck with `club`, `shape` and `spin`: the kind of the tip it took, if a tip was said for this shot and it took it. */
  struck(club: string, shape: number, spin = 0): TipKind | null {
    const tip = this.offered;
    this.newShot();
    this.say(null);
    // a ball put back where it was struck from (the water, out of bounds) is a new shot from the same place, and is looked at again
    this.at.x = NaN;
    return tip && tookTip(tip, club, shape, spin) ? tip.kind : null;
  }

  private offer(tip: Tip) {
    this.offered = tip;
    this.say(tip.text, tip.button);
  }

  private say(text: string | null, button: string | null = null) {
    this.said.text = text;
    this.said.button = text === null ? null : button;
  }

  private newShot() {
    this.offered = null;
    this.voiced = this.dismissed = this.asked = false;
  }
}
