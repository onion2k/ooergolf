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
import { Previewer, type Preview } from './preview';
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
} as const;

/** What goes wrong with a shot: it comes down in the water, out of bounds or in the sand, or a tree or the rail knocks it in the air. */
export type Trouble = 'water' | 'out' | 'sand' | 'tree';

export type TipKind = 'shape' | 'club';

/** A tip: the club and the shape to strike it with, the way it was tried, the words, and what its button says. */
export interface Tip {
  kind: TipKind;
  /** The club of the bag to take, and the shape to strike it with: -1 a draw, 0 straight, 1 a fade. */
  club: string;
  shape: number;
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

type Phase = 'idle' | 'start' | 'shapes' | 'layup' | 'reach' | 'done';

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
    const { layout, world, ball } = game;
    if (!layout.golf || !game.ready || game.phase !== 'play') return;
    const x = world.x[ball],
      y = world.y[ball];
    if (lieAt(layout, x, y) === LIE.green || !(game.inHand.loft > 0)) return;
    this.from.x = x;
    this.from.y = y;
    this.inHand = BAG.find((c) => c.id === game.inHand.id) ?? BAG[0];
    this.shape = Math.sign(game.shape);
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
      case 'done':
      case 'idle':
        break;
    }
    if (this.previews >= CADDIE.previews && !this.done) this.phase = 'done';
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
        this.tip = {
          kind: 'shape',
          club: this.inHand.id,
          shape: s,
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
    this.tip = {
      kind: 'club',
      club: club.id,
      shape: 0,
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
    this.tip = {
      kind: 'club',
      club: club.id,
      shape: 0,
      angle: this.cupHeading,
      carry: p.carry,
      text: `${this.inHand.name} carries ${Math.round(this.handCarry)}, and the pin is ${Math.round(this.cupYards)} yd. A full ${lower(club)} ${p.end === 'holed' ? 'drops in the cup' : `carries ${Math.round(p.carry)}`}.`,
      button: `Take the ${lower(club)}`,
    };
    this.phase = 'done';
  }

  /** A preview of `club` at full power along `angle` with `shape`, counted. */
  private run(club: BagClub, angle: number, shape: number): Preview {
    this.previews++;
    return this.previewer.run(this.from, club, angle, 1, shape, 0);
  }

  /** The tip's own shot tried again, from where the ball lies: what `caddieProblems` holds it to. */
  retry(tip: Tip): Preview {
    return this.previewer.run(this.from, BAG.find((c) => c.id === tip.club) ?? BAG[0], tip.angle, 1, tip.shape, 0);
  }

  /** How many bodies its rehearsal has: the one ball. */
  get bodies(): number {
    return this.previewer.bodies;
  }
}

/** Whether a shot struck with `club` and `shape` took `tip`: the tip's club, and for a tip of shape its shape too. */
export function tookTip(tip: Tip, club: string, shape: number): boolean {
  return club === tip.club && (tip.kind === 'club' || Math.sign(shape) === tip.shape);
}

/** Whether a kind of tip is said without being asked for: until the player has taken `CADDIE.taken` of it. */
export function speaks(kind: TipKind, taken: { club: number; shape: number }): boolean {
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
  private readonly at = { x: NaN, y: NaN, club: '', shape: NaN, kitClub: '', kitBall: '', kitAccessory: '' };
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
  frame(game: Game, taken: { club: number; shape: number }, quiet = false) {
    const caddie = this.caddie;
    if (!caddie || quiet || !game.ready || game.phase !== 'play') {
      this.say(null);
      return;
    }
    const { world, ball } = game;
    const x = world.x[ball],
      y = world.y[ball];
    const club = game.inHand.id,
      shape = Math.sign(game.shape);
    if (x !== this.at.x || y !== this.at.y) this.newShot();
    const { at } = this,
      slots = game.slots;
    if (
      x !== at.x ||
      y !== at.y ||
      club !== at.club ||
      shape !== at.shape ||
      slots.club !== at.kitClub ||
      slots.ball !== at.kitBall ||
      slots.accessory !== at.kitAccessory
    ) {
      at.x = x;
      at.y = y;
      at.club = club;
      at.shape = shape;
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
      tip !== null && this.offered !== null && tip.club === this.offered.club && tip.shape === this.offered.shape;
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

  /** The tip's button: its club and shape put in hand, as the bag's buttons would. Whether there was a tip to take. */
  take(game: Game): boolean {
    const tip = this.offered;
    if (!tip || this.said.text === null || this.said.button === null) return false;
    if (!game.pick(tip.club)) return false;
    game.setShape(tip.shape);
    this.asked = false;
    return true;
  }

  /** A stroke struck with `club` and `shape`: the kind of the tip it took, if a tip was said for this shot and it took it. */
  struck(club: string, shape: number): TipKind | null {
    const tip = this.offered;
    this.newShot();
    this.say(null);
    // a ball put back where it was struck from (the water, out of bounds) is a new shot from the same place, and is looked at again
    this.at.x = NaN;
    return tip && tookTip(tip, club, shape) ? tip.kind : null;
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
