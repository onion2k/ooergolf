/**
 * The words over the course, all in the page: the hole, the strokes and the
 * par; a word when a hole is done; the card when the round is over, with a
 * button for another; the coins and gems; and the shop. It is handed what to
 * show and never reads the game, so it is only ever what the game's events
 * said, and what the player presses goes back through the handlers it is
 * given.
 *
 * How the words look, and how each panel springs in and out, is the page's
 * stylesheet: this only says what is up, and what kind of word the callout
 * over the course is and each score on the card, so the stylesheet can
 * colour them. Showing or hiding a panel is its `hidden`, which the
 * stylesheet turns into the motion, or into none for a player who has asked
 * for less.
 */
import type { Club } from './clubs';
import type { Mode } from './gesture';
import { windText } from './readout';
import { SCORE_KINDS, againstPar, scoreKind, scoreName } from './score';

/** Each kind of word the callout over the course says, which the stylesheet colours: a score's kind, the water, or out of bounds. */
export const CALLOUTS = [...SCORE_KINDS, 'splash', 'out'] as const;
export type Callout = (typeof CALLOUTS)[number];

export interface HudHandlers {
  again(): void;
  /** A course chosen on the start screen, by its name; and the card's way back to the screen. */
  choose(name: string): void;
  courses(): void;
  buy(id: string): void;
  equip(id: string): void;
  /** The switch pressed: what a drag on the course is from now on, a shot or a turn of the camera. */
  mode(mode: Mode): void;
  /** A club of the bag chosen on a golf hole, by its id. */
  club(id: string): void;
  /** The shape button pressed: the next shape in its cycle, from minus one (a draw) to one (a fade). */
  shape(value: number): void;
  /** The spin button pressed: the next spin in its cycle, from minus one (backspin) to one (topspin). */
  spin(value: number): void;
}

/** A club of the bag as the picker shows it: what to press, what to call it, how far it carries at full power, and its loft (none for the putter). */
export interface BagInfo {
  id: string;
  name: string;
  label: string;
  carry: number;
  loft: number;
}

/**
 * The shapes and the spins a button cycles through, in the order it is pressed: straight, draw, fade; flat, back, top.
 * Each is a value the game takes, and each has the word the button shows and the one it says to a screen reader.
 */
const SHAPES = [
  { value: 0, label: 'Straight', say: 'straight' },
  { value: -1, label: 'Draw', say: 'draw, curving left' },
  { value: 1, label: 'Fade', say: 'fade, curving right' },
] as const;
const SPINS = [
  { value: 0, label: 'Flat', say: 'flat' },
  { value: -1, label: 'Back', say: 'backspin' },
  { value: 1, label: 'Top', say: 'topspin' },
] as const;

/** What the shape and spin buttons show, as the page drew it: whether they are up, each one's value and its words. */
export interface ControlsDrawn {
  shown: boolean;
  shape: number;
  spin: number;
  shapeText: string;
  spinText: string;
}

/**
 * What is drawn over a hole's map, in the map's own pixels, written by the page each frame and drawn when it changes: the
 * ball and the cup; while a shot is aimed, the line to where it lands and the ring there, which is what the flight comes to
 * (0 the course, 1 water, 2 out of bounds, 3 the cup); the spread of a swing as an ellipse (its middle, its half axes along
 * and across, and how it is turned); and what the camera shows, as four corners.
 */
export interface MapOverlay {
  ball: [number, number];
  cup: [number, number];
  aim: boolean;
  to: [number, number];
  ring: 0 | 1 | 2 | 3;
  spread: boolean;
  ellipse: [number, number, number, number, number];
  view: boolean;
  corners: Float64Array;
}
/** How many numbers an overlay is, to tell whether it has changed. */
const MAP_FIELDS = 2 + 2 + 1 + 2 + 1 + 1 + 5 + 1 + 8;
/** The colours drawn over the map: the ball, the cup's flag, the line of the aim, the camera's view, and the ring by what it comes to. */
const MAP_INK = {
  ball: '#ffffff',
  edge: '#2b3a4a',
  flag: '#e0413a',
  aim: '#ffffff',
  view: 'rgba(255,255,255,0.22)',
  viewEdge: 'rgba(255,255,255,0.85)',
  rings: ['#ffd23f', '#3aa0ff', '#ff5a4a', '#8de03a'],
} as const;

/** What the shop needs to know of the save to show each club as for sale, owned, or in hand. */
export interface Purse {
  coins: number;
  gems: number;
  owned: readonly string[];
  club: string;
}

/** What the help says a drag does, in each mode: a golf hole's is a swing, and a minigolf hole's a putt. */
const HELP = {
  aim: 'drag back and let go to putt',
  swing: 'drag back and let go to swing',
  look: 'drag to look round',
} as const;

export interface HoleInfo {
  index: number;
  count: number;
  name: string;
  par: number;
}

export class Hud {
  private readonly panel = document.getElementById('strokes')!;
  private readonly strokes = this.panel.querySelector('b')!;
  private readonly unit = this.panel.querySelector('.unit')!;
  private readonly hole = document.getElementById('holeName')!;
  private readonly holeOf = this.hole.querySelector('.of')!;
  private readonly holeTitle = this.hole.querySelector('.name')!;
  private readonly par = document.getElementById('holePar')!;
  private readonly toast = document.getElementById('toast')!;
  private readonly card = document.getElementById('card')!;
  private readonly rows = document.getElementById('cardRows')!;
  private readonly total = document.getElementById('cardTotal')!;
  private readonly purse = document.getElementById('purse')!;
  private readonly coins = document.getElementById('coins')!;
  private readonly gems = document.getElementById('gems')!;
  private readonly shop = document.getElementById('shop')!;
  private readonly clubs = document.getElementById('shopClubs')!;
  private readonly start = document.getElementById('start')!;
  private readonly courseList = document.getElementById('courses')!;
  private readonly help = document.getElementById('help')!;
  private readonly modes = document.getElementById('viewMode')!;
  private readonly aimButton = document.getElementById('modeAim')!;
  private readonly lookButton = document.getElementById('modeLook')!;
  private readonly bag = document.getElementById('bag')!;
  private readonly bagInfo = document.getElementById('bagInfo')!;
  private readonly bagClubs = document.getElementById('bagClubs')!;
  private readonly pin = document.getElementById('pin')!;
  private readonly windLine = document.getElementById('wind')!;
  private readonly windArrow = document.getElementById('windArrow')!;
  private readonly windWords = document.getElementById('windText')!;
  private readonly shaping = document.getElementById('bagShaping')!;
  private readonly shapeButton = document.getElementById('shapeButton')!;
  private readonly spinButton = document.getElementById('spinButton')!;
  private readonly mapPanel = document.getElementById('holePanel')!;
  private readonly mapCanvas = document.getElementById('holeMap') as HTMLCanvasElement;
  /** The map's drawing context, made when a golf hole first has a map and not at boot, which is every course's. */
  private mapContextMade: CanvasRenderingContext2D | null = null;
  /** The hole's map as it was painted, redrawn from under what is drawn over it, and what was last drawn over it. */
  private mapBase: ImageData | null = null;
  private readonly mapDrawn = new Float64Array(MAP_FIELDS);
  private readonly mapNow = new Float64Array(MAP_FIELDS);
  /** What the page writes each frame for what is drawn over the map, and `drawMap` draws if it changed. */
  readonly overlay: MapOverlay = {
    ball: [0, 0],
    cup: [0, 0],
    aim: false,
    to: [0, 0],
    ring: 0,
    spread: false,
    ellipse: [0, 0, 0, 0, 0],
    view: false,
    corners: new Float64Array(8),
  };
  /** The club in hand and how far it carries, which the words over the bag say: until a shot is aimed. */
  private club = '';
  private carryLine = '';
  /** The clubs the picker has, none on a hole of minigolf; and what a drag does, which the help says. */
  private bagList: readonly BagInfo[] = [];
  private mode: Mode = 'aim';
  /** The shape and the spin the buttons show, and the turn the wind's arrow was last written at, so each is written only when it changes. */
  private shapeShown = 0;
  private spinShown = 0;
  private windTurn = NaN;

  constructor(
    private readonly handlers: HudHandlers,
    private readonly catalogue: readonly Club[],
  ) {
    document.getElementById('again')!.addEventListener('click', () => handlers.again());
    document.getElementById('cardCourses')!.addEventListener('click', () => handlers.courses());
    const open = () => {
      this.shop.hidden = false;
    };
    document.getElementById('shopOpen')!.addEventListener('click', open);
    document.getElementById('cardShop')!.addEventListener('click', open);
    document.getElementById('shopClose')!.addEventListener('click', () => {
      this.shop.hidden = true;
    });
    this.aimButton.addEventListener('click', () => handlers.mode('aim'));
    this.lookButton.addEventListener('click', () => handlers.mode('look'));
    // each cycles to the next of its three, and the game says what it took (`setShaping`)
    this.shapeButton.addEventListener('click', () => handlers.shape(this.next(SHAPES, this.shapeShown)));
    this.spinButton.addEventListener('click', () => handlers.spin(this.next(SPINS, this.spinShown)));
    this.setShaping(0, 0, true);
  }

  /** The value after `value` in a cycle of buttons: the first for one that is not in it. */
  private next(cycle: readonly { value: number }[], value: number): number {
    const at = cycle.findIndex((c) => c.value === value);
    return cycle[(at + 1) % cycle.length].value;
  }

  /**
   * The shape and the spin chosen, shown on their buttons: the word, the value (for the stylesheet, which lights a
   * button that is not straight or flat) and what a screen reader is told. Written only when one changes, so the page
   * may say it every frame; a value that is not one of the cycle's shows as the nearest, by its sign.
   */
  setShaping(shape: number, spin: number, force = false) {
    if (!force && shape === this.shapeShown && spin === this.spinShown) return;
    this.shapeShown = shape;
    this.spinShown = spin;
    const s = SHAPES.find((c) => c.value === Math.sign(shape)) ?? SHAPES[0];
    const p = SPINS.find((c) => c.value === Math.sign(spin)) ?? SPINS[0];
    this.shapeButton.textContent = `Shape: ${s.label}`;
    this.shapeButton.dataset.shape = String(s.value);
    this.shapeButton.setAttribute('aria-label', `Shape: ${s.say}. Press to change.`);
    this.spinButton.textContent = `Spin: ${p.label}`;
    this.spinButton.dataset.spin = String(p.value);
    this.spinButton.setAttribute('aria-label', `Spin: ${p.say}. Press to change.`);
  }

  /** The two buttons as they are drawn now, read from the page and not from what was last said to it: for the test API. */
  controls(): ControlsDrawn {
    return {
      // up when the bag is and a lofted club is in hand; a panel put away stays drawn while it shrinks, so it is its `hidden` that says
      shown: !this.shaping.hidden && !this.bag.hidden,
      shape: Number(this.shapeButton.dataset.shape),
      spin: Number(this.spinButton.dataset.spin),
      shapeText: this.shapeButton.textContent,
      spinText: this.spinButton.textContent,
    };
  }

  /** The switch shows which a drag is, and the help says what to do with it: swing, on a golf hole, and not putt. */
  setMode(mode: Mode) {
    this.mode = mode;
    this.aimButton.setAttribute('aria-pressed', String(mode === 'aim'));
    this.lookButton.setAttribute('aria-pressed', String(mode === 'look'));
    this.help.textContent = mode === 'look' ? HELP.look : this.bagList.length ? HELP.swing : HELP.aim;
  }

  /**
   * The picker of a golf hole's clubs, with `active` in hand, or put away for a hole of minigolf: one pill a club,
   * pressed through `club`, and above them the club in hand and how far it carries. Shown with the course's other
   * panels, and away under the start screen.
   */
  setBag(clubs: readonly BagInfo[] | null, active = '') {
    this.bagList = clubs ?? [];
    this.setMode(this.mode);
    if (!clubs) {
      this.bag.hidden = true;
      this.shaping.hidden = true;
      return;
    }
    this.bagClubs.replaceChildren(
      ...clubs.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c.label;
        b.dataset.club = c.id;
        b.setAttribute('aria-label', c.name);
        b.addEventListener('click', () => this.handlers.club(c.id));
        return b;
      }),
    );
    this.setClub(active);
    this.bag.hidden = !this.start.hidden;
  }

  /** The club in hand: its pill stands up, and what it is and how far it carries is said above them. */
  setClub(active: string) {
    for (const b of Array.from(this.bagClubs.querySelectorAll('button')))
      b.setAttribute('aria-pressed', String(b.dataset.club === active));
    const c = this.bagList.find((x) => x.id === active);
    // a shape and a spin are for a lofted club: the putter rolls along the ground, where neither does anything
    this.shaping.hidden = !(c && c.loft > 0);
    this.club = c ? c.name : '';
    this.carryLine = c ? (c.carry > 0 ? `${c.name} \u00b7 carries ${Math.round(c.carry)}` : c.name) : '';
    this.bagInfo.textContent = this.carryLine;
  }

  /** Where the shot being aimed would come down, said after the club in hand in place of how far it carries; none puts the carry back. */
  setLanding(text: string | null) {
    const words = text ? `${this.club} \u00b7 ${text}` : this.carryLine;
    if (this.bagInfo.textContent !== words) this.bagInfo.textContent = words;
  }

  /** The pin from where the ball lies, as words under the strokes; none for a hole that has no such thing. */
  setPin(text: string | null) {
    this.pin.hidden = text === null;
    if (text !== null && this.pin.textContent !== text) this.pin.textContent = text;
  }

  /**
   * The wind of a golf hole in a line under the pin: how hard it blows in whole miles an hour, or the word calm with no
   * arrow, which a player always has; none for a hole that has no such thing. Its arrow is turned by `setWindArrow`.
   */
  setWind(speed: number | null) {
    this.windLine.hidden = speed === null;
    if (speed === null) return;
    const text = windText(speed);
    if (this.windWords.textContent !== text) this.windWords.textContent = text;
    this.windLine.toggleAttribute('data-calm', text === 'calm');
    this.windTurn = NaN;
  }

  /**
   * The wind's arrow turned `degrees` clockwise from pointing up, written only when it has turned by a visible amount
   * (a quarter of a degree), so the page may say it every frame, as a camera glides, and nothing is made.
   */
  setWindArrow(degrees: number) {
    if (Math.abs(degrees - this.windTurn) < 0.25) return;
    this.windTurn = degrees;
    this.windArrow.style.transform = `rotate(${degrees.toFixed(1)}deg)`;
  }

  /** How the wind is drawn: its arrow's turn as it was last written, and the words beside it; null when there is no wind line up. */
  windDrawn(): { degrees: number; text: string } | null {
    if (this.windLine.hidden) return null;
    return { degrees: Number.isNaN(this.windTurn) ? 0 : this.windTurn, text: this.windWords.textContent };
  }

  /** The hole's map, painted, put over the course; none puts it away. Drawn over from `overlay`, by `drawMap`. */
  setMap(picture: { width: number; height: number; pixels: Uint8ClampedArray } | null) {
    if (!picture) {
      this.mapBase = null;
      this.mapPanel.hidden = true;
      return;
    }
    this.mapCanvas.width = picture.width;
    this.mapCanvas.height = picture.height;
    this.mapBase = new ImageData(picture.pixels as Uint8ClampedArray<ArrayBuffer>, picture.width, picture.height);
    this.mapDrawn.fill(NaN);
    this.mapContext.putImageData(this.mapBase, 0, 0);
    this.mapPanel.hidden = !this.start.hidden;
  }

  private get mapContext(): CanvasRenderingContext2D {
    return (this.mapContextMade ??= this.mapCanvas.getContext('2d')!);
  }

  /** The map redrawn from what is to be drawn over it, if any of that has changed since it was last drawn: nothing is made. */
  drawMap() {
    const base = this.mapBase;
    if (!base || this.mapPanel.hidden) return;
    const o = this.overlay;
    const now = this.mapNow;
    let k = 0;
    now[k++] = o.ball[0];
    now[k++] = o.ball[1];
    now[k++] = o.cup[0];
    now[k++] = o.cup[1];
    now[k++] = o.aim ? 1 : 0;
    now[k++] = o.to[0];
    now[k++] = o.to[1];
    now[k++] = o.ring;
    now[k++] = o.spread ? 1 : 0;
    for (let e = 0; e < 5; e++) now[k++] = o.ellipse[e];
    now[k++] = o.view ? 1 : 0;
    for (let e = 0; e < 8; e++) now[k++] = o.corners[e];
    let same = true;
    for (let e = 0; e < MAP_FIELDS; e++)
      if (now[e] !== this.mapDrawn[e]) {
        same = false;
        break;
      }
    if (same) return;
    this.mapDrawn.set(now);
    const c = this.mapContext;
    c.putImageData(base, 0, 0);
    if (o.view) {
      c.beginPath();
      c.moveTo(o.corners[0], o.corners[1]);
      for (let e = 1; e < 4; e++) c.lineTo(o.corners[e * 2], o.corners[e * 2 + 1]);
      c.closePath();
      c.fillStyle = MAP_INK.view;
      c.fill();
      c.strokeStyle = MAP_INK.viewEdge;
      c.lineWidth = 1;
      c.stroke();
    }
    if (o.aim) {
      c.strokeStyle = MAP_INK.aim;
      c.lineWidth = 1;
      c.setLineDash([2, 2]);
      c.beginPath();
      c.moveTo(o.ball[0], o.ball[1]);
      c.lineTo(o.to[0], o.to[1]);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = MAP_INK.rings[o.ring];
      if (o.spread) {
        c.beginPath();
        c.ellipse(
          o.ellipse[0],
          o.ellipse[1],
          Math.max(1, o.ellipse[2]),
          Math.max(1, o.ellipse[3]),
          o.ellipse[4],
          0,
          Math.PI * 2,
        );
        c.lineWidth = 1;
        c.stroke();
      }
      c.beginPath();
      c.arc(o.to[0], o.to[1], 3, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.stroke();
    }
    // the cup's flag, and the ball on top of everything
    c.strokeStyle = MAP_INK.edge;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(o.cup[0], o.cup[1] + 1);
    c.lineTo(o.cup[0], o.cup[1] - 6);
    c.stroke();
    c.fillStyle = MAP_INK.flag;
    c.beginPath();
    c.moveTo(o.cup[0], o.cup[1] - 6);
    c.lineTo(o.cup[0] + 4.5, o.cup[1] - 4.2);
    c.lineTo(o.cup[0], o.cup[1] - 2.5);
    c.fill();
    c.fillStyle = MAP_INK.ball;
    c.strokeStyle = MAP_INK.edge;
    c.beginPath();
    c.arc(o.ball[0], o.ball[1], 2.6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  show() {
    this.panel.hidden = false;
    this.purse.hidden = false;
    this.help.hidden = false;
    this.modes.hidden = false;
    this.bag.hidden = !this.bagList.length;
    this.mapPanel.hidden = !this.mapBase;
  }

  /**
   * The start screen, over the course, with a card for each course: its name,
   * how many holes and its par. Everything else over the course is put away
   * while it is up; a click on a card goes back through `choose`.
   */
  showStart(courses: readonly { name: string; holes: number; par: number }[]) {
    this.courseList.replaceChildren(
      ...courses.map((c) => {
        const card = document.createElement('button');
        card.className = 'course';
        const name = document.createElement('b');
        name.textContent = c.name;
        const about = document.createElement('small');
        for (const text of [`${c.holes} holes`, `par ${c.par}`]) {
          const pill = document.createElement('span');
          pill.textContent = text;
          about.append(pill);
        }
        card.append(name, about);
        card.addEventListener('click', () => this.handlers.choose(c.name));
        return card;
      }),
    );
    for (const el of [
      this.panel,
      this.purse,
      this.help,
      this.modes,
      this.bag,
      this.mapPanel,
      this.card,
      this.shop,
      this.toast,
    ])
      el.hidden = true;
    this.start.hidden = false;
  }

  /** The start screen put away, and the course's words shown. */
  hideStart() {
    this.start.hidden = true;
    this.show();
  }

  /** The coins and gems, and the shop's clubs as the save now has them. */
  setPurse(p: Purse) {
    this.coins.textContent = String(p.coins);
    this.gems.textContent = String(p.gems);
    this.clubs.replaceChildren(
      ...this.catalogue.map((club) => {
        const row = document.createElement('div');
        row.className = 'club';
        row.dataset.club = club.id;
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        const [r, g, b] = club.colour.map((c) => Math.round(Math.min(1, c) * 255));
        swatch.style.background = `rgb(${r} ${g} ${b})`;
        const name = document.createElement('span');
        name.textContent = club.name;
        const detail = document.createElement('small');
        // each figure kept with its word, so a narrow shop breaks the line between them and never inside one
        detail.textContent = `power\u00a0${club.hardest}${club.coins ? ` \u00b7 ${club.coins}\u00a0coins` : ''}${club.gems ? ` +\u00a0${club.gems}\u00a0gem${club.gems > 1 ? 's' : ''}` : ''}`;
        name.append(detail);
        const button = document.createElement('button');
        const owned = p.owned.includes(club.id);
        if (p.club === club.id) {
          // not a button to press but a badge, which the stylesheet draws as one
          button.textContent = 'In hand';
          button.className = 'held';
          button.disabled = true;
        } else if (owned) {
          button.textContent = 'Use';
          button.className = 'quiet';
          button.addEventListener('click', () => this.handlers.equip(club.id));
        } else {
          button.textContent = 'Buy';
          button.disabled = p.coins < club.coins || p.gems < club.gems;
          button.addEventListener('click', () => this.handlers.buy(club.id));
        }
        row.append(swatch, name, button);
        return row;
      }),
    );
  }

  /** A hole begun: its number and name, its par, no strokes, and nothing else over the course. */
  started(info: HoleInfo) {
    this.holeOf.textContent = `Hole ${info.index + 1} of ${info.count}`;
    this.holeTitle.textContent = info.name;
    this.par.textContent = `par ${info.par}`;
    this.setStrokes(0);
    this.toast.hidden = true;
    this.card.hidden = true;
    this.shop.hidden = true;
  }

  /** The strokes taken; a new stroke takes away the water's word left over the course by the last. */
  setStrokes(n: number) {
    const loss = this.toast.dataset.kind === 'splash' || this.toast.dataset.kind === 'out';
    if (this.strokes.textContent !== String(n) && loss) this.toast.hidden = true;
    this.strokes.textContent = String(n);
    this.unit.textContent = n === 1 ? 'stroke' : 'strokes';
  }

  /** The word over the course, of its kind, which the stylesheet colours and pops in. */
  private callout(text: string, kind: Callout) {
    this.toast.textContent = text;
    this.toast.dataset.kind = kind;
    this.toast.hidden = false;
  }

  /** The ball into the water: a word for it, until the next stroke. */
  splash() {
    this.callout('In the water! +1', 'splash');
  }

  /** The ball out of bounds: a word for it, until the next stroke. */
  outOfBounds() {
    this.callout('Out of bounds! +1', 'out');
  }

  /** A hole done: what the score is called, large, until the next begins. */
  done(strokes: number, par: number, pickedUp: boolean) {
    this.callout(scoreName(strokes, par, pickedUp), scoreKind(strokes, par, pickedUp));
  }

  /** The round over: every hole's par and score, each score marked by its kind, and the total against par. */
  finished(holes: readonly { name: string; par: number }[], card: readonly number[]) {
    this.toast.hidden = true;
    this.rows.replaceChildren(
      ...holes.map((h, i) => {
        const tr = document.createElement('tr');
        for (const text of [String(i + 1), h.name, String(h.par)]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        const score = document.createElement('td');
        const strokes = card.at(i);
        if (strokes !== undefined) {
          const mark = document.createElement('span');
          mark.className = 'mark';
          mark.dataset.kind = scoreKind(strokes, h.par);
          mark.textContent = String(strokes);
          score.append(mark);
        }
        tr.append(score);
        return tr;
      }),
    );
    const strokes = card.reduce((a, b) => a + b, 0),
      par = holes.reduce((a, h) => a + h.par, 0);
    this.total.textContent = `${strokes} (${againstPar(strokes, par)})`;
    this.card.hidden = false;
  }
}
