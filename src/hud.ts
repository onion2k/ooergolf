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
import type { Item } from './items';
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
  /** The overhead button pressed: the view from above wanted on or off, the one it is not now. A drag is a pan while it is on. */
  overhead(on: boolean): void;
  /** The flag button pressed: the camera turned to face the cup. */
  flag(): void;
  /** The Retake button pressed: the Mulligan item's one free retake of the last stroke. */
  retake(): void;
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

/** What the shop needs to know of the save to show each item as for sale, owned, or equipped. */
export interface Purse {
  coins: number;
  gems: number;
  owned: readonly string[];
  /** The item equipped, '' for none. */
  item: string;
}

/** What the help says a drag does, in each mode: a golf hole's is a swing, and a minigolf hole's a putt. */
const HELP = {
  aim: 'drag back and let go to putt',
  swing: 'drag back and let go to swing',
  overhead: 'drag to look round the hole',
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
  private readonly chip = document.getElementById('holeChip')!;
  private readonly chipOpen = document.getElementById('holeInfoOpen')!;
  private readonly chipHole = document.getElementById('chipHole')!;
  private readonly chipStrokes = document.getElementById('chipStrokes')!;
  private readonly chipUnit = document.getElementById('chipUnit')!;
  private readonly scrim = document.getElementById('drawerScrim')!;
  private readonly coins = document.getElementById('coins')!;
  private readonly gems = document.getElementById('gems')!;
  private readonly shop = document.getElementById('shop')!;
  private readonly items = document.getElementById('shopItems')!;
  private readonly start = document.getElementById('start')!;
  private readonly courseList = document.getElementById('courses')!;
  private readonly help = document.getElementById('help')!;
  private readonly modes = document.getElementById('viewMode')!;
  private readonly overheadButton = document.getElementById('viewOverhead') as HTMLButtonElement;
  private readonly flagButton = document.getElementById('viewFlag') as HTMLButtonElement;
  private readonly retakePanel = document.getElementById('retakePanel')!;
  private readonly retakeButton = document.getElementById('mulligan') as HTMLButtonElement;
  private readonly bag = document.getElementById('bag')!;
  private readonly bagInfo = document.getElementById('bagInfo')!;
  private readonly bagClubs = document.getElementById('bagClubs')!;
  private readonly pin = document.getElementById('pin')!;
  private readonly windLine = document.getElementById('wind')!;
  private readonly windArrow = document.getElementById('windArrow')!;
  private readonly windWords = document.getElementById('windText')!;
  private readonly greens = document.getElementById('greens')!;
  private readonly putt = document.getElementById('putt')!;
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
    private readonly catalogue: readonly Item[],
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
    // on a phone the hole's panel is a drawer off the screen's edge: the chip pulls it out, and it is shut by its button, a
    // tap on the course beside it or the escape key (the stylesheet says where it stands; on a desk none of this is shown)
    this.chipOpen.addEventListener('click', () => this.setDrawer(true));
    document.getElementById('holeInfoClose')!.addEventListener('click', () => this.setDrawer(false));
    this.scrim.addEventListener('click', () => this.setDrawer(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.setDrawer(false);
    });
    this.overheadButton.addEventListener('click', () => handlers.overhead(this.mode !== 'overhead'));
    this.flagButton.addEventListener('click', () => handlers.flag());
    this.retakeButton.addEventListener('click', () => handlers.retake());
    // each cycles to the next of its three, and the game says what it took (`setShaping`)
    this.shapeButton.addEventListener('click', () => handlers.shape(this.next(SHAPES, this.shapeShown)));
    this.spinButton.addEventListener('click', () => handlers.spin(this.next(SPINS, this.spinShown)));
    this.setShaping(0, 0, true);
  }

  /**
   * The hole's drawer open or shut, on a phone: the page's root says which (`data-drawer`, which the stylesheet moves the
   * panel by), the chip says whether it is open to a screen reader, and the scrim over the course is up while it is.
   */
  setDrawer(open: boolean) {
    document.documentElement.dataset.drawer = open ? 'open' : 'closed';
    this.chipOpen.setAttribute('aria-expanded', String(open));
    this.scrim.hidden = !open;
  }

  /** Whether the hole's drawer is open: for the test API. */
  drawerOpen(): boolean {
    return document.documentElement.dataset.drawer === 'open';
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

  /**
   * The Retake button put on the course or away (the rule is `retakeShown`, which the page asks of the game each frame, as
   * the hud draws and never reads the game). Written only when it changes, so the page may say it every frame; a panel put
   * away stays drawn while it shrinks, so its button is disabled as it goes and takes no press.
   */
  setRetake(on: boolean) {
    if (on === !this.retakePanel.hidden) return;
    this.retakeButton.disabled = !on;
    this.retakePanel.hidden = !on;
  }

  /** Whether the Retake button is up and can be pressed, as drawn: for the test API. */
  retakeDrawn(): { shown: boolean; enabled: boolean } {
    return { shown: !this.retakePanel.hidden, enabled: !this.retakeButton.disabled };
  }

  /**
   * The overhead button shows whether the view is from above, and the help says what a drag does: look round the hole from
   * above, or swing (on a golf hole, and not putt). The flag button is put away while it is on, since there is no turning
   * the camera to face the cup from above.
   */
  setOverhead(on: boolean) {
    this.mode = on ? 'overhead' : 'aim';
    this.overheadButton.setAttribute('aria-pressed', String(on));
    this.flagButton.disabled = on;
    this.help.textContent = on ? HELP.overhead : this.bagList.length ? HELP.swing : HELP.aim;
  }

  /**
   * The picker of a golf hole's clubs, with `active` in hand, or put away for a hole of minigolf: one pill a club,
   * pressed through `club`, and above them the club in hand and how far it carries. Shown with the course's other
   * panels, and away under the start screen.
   */
  setBag(clubs: readonly BagInfo[] | null, active = '') {
    this.bagList = clubs ?? [];
    this.setOverhead(this.mode === 'overhead');
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

  /** How fast the hole's greens run, in a line under the wind: none for a hole that has not set it, which reads as it always did. */
  setGreens(text: string | null) {
    this.greens.hidden = text === null;
    if (text !== null && this.greens.textContent !== text) this.greens.textContent = text;
  }

  /**
   * The break of the putt from where the ball lies, in words under the greens' speed: only while the ball rests on the green
   * or the first cut of a hole that has a contour to read; none puts it away. Written only when it changes.
   */
  setPutt(text: string | null) {
    this.putt.hidden = text === null;
    if (text !== null && this.putt.textContent !== text) this.putt.textContent = text;
  }

  /** The speed line and the putt's line as drawn: their words, or null for each that is put away. */
  puttDrawn(): { greens: string | null; putt: string | null } {
    return {
      greens: this.greens.hidden ? null : this.greens.textContent,
      putt: this.putt.hidden ? null : this.putt.textContent,
    };
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
    this.chip.hidden = false;
    this.help.hidden = false;
    this.modes.hidden = false;
    this.bag.hidden = !this.bagList.length;
    this.mapPanel.hidden = !this.mapBase;
  }

  /**
   * The start screen, over the course, with a card for each course: its name,
   * how many holes and its par, under a heading for each kind of game (Minigolf,
   * then Golf), since the two are played so differently and a player chooses
   * between them first. A kind with no course has no heading. Everything else over
   * the course is put away while it is up; a click on a card goes back through `choose`.
   */
  showStart(courses: readonly { name: string; holes: number; par: number; golf?: boolean }[]) {
    const cardOf = (c: { name: string; holes: number; par: number }) => {
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
    };
    const parts: HTMLElement[] = [];
    for (const [title, golf] of [
      ['Minigolf', false],
      ['Golf', true],
    ] as const) {
      const of = courses.filter((c) => !!c.golf === golf);
      if (!of.length) continue;
      const heading = document.createElement('h2');
      heading.textContent = title;
      parts.push(heading, ...of.map(cardOf));
    }
    this.courseList.replaceChildren(...parts);
    this.retakeButton.disabled = true;
    for (const el of [
      this.panel,
      this.purse,
      this.chip,
      this.help,
      this.modes,
      this.retakePanel,
      this.bag,
      this.mapPanel,
      this.card,
      this.shop,
      this.toast,
    ])
      el.hidden = true;
    this.start.hidden = false;
    this.setDrawer(false);
  }

  /** The start screen put away, and the course's words shown. */
  hideStart() {
    this.start.hidden = true;
    this.show();
  }

  /** The coins and gems, and the shop's items as the save now has them: one row for no item, then each item for sale. */
  setPurse(p: Purse) {
    this.coins.textContent = String(p.coins);
    this.gems.textContent = String(p.gems);
    const row = (
      id: string,
      name: string,
      effect: string,
      price: string,
      colour: string,
      button: HTMLButtonElement,
    ) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.dataset.item = id;
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = colour;
      const words = document.createElement('span');
      words.textContent = name;
      const detail = document.createElement('small');
      detail.textContent = effect;
      words.append(detail);
      if (price) {
        const cost = document.createElement('small');
        cost.className = 'price';
        cost.textContent = price;
        words.append(cost);
      }
      el.append(swatch, words, button);
      return el;
    };
    /** The row's button: a badge for the one equipped, Equip for one owned, and Buy for one that is not. */
    const button = (id: string, owned: boolean, can: boolean) => {
      const b = document.createElement('button');
      if (p.item === id) {
        // not a button to press but a badge, which the stylesheet draws as one
        b.textContent = 'Equipped';
        b.className = 'held';
        b.disabled = true;
      } else if (owned) {
        b.textContent = 'Equip';
        b.className = 'quiet';
        b.addEventListener('click', () => this.handlers.equip(id));
      } else {
        b.textContent = 'Buy';
        b.disabled = !can;
        b.addEventListener('click', () => this.handlers.buy(id));
      }
      return b;
    };
    this.items.replaceChildren(
      row('', 'No item', 'Play the ball as it comes.', '', 'transparent', button('', true, true)),
      ...this.catalogue.map((item) => {
        const [r, g, b] = item.colour.map((c) => Math.round(Math.min(1, c) * 255));
        const owned = p.owned.includes(item.id);
        // each figure kept with its word, so a narrow shop breaks the line between them and never inside one
        const price = owned
          ? ''
          : `${item.coins}\u00a0coins${item.gems ? ` +\u00a0${item.gems}\u00a0gem${item.gems > 1 ? 's' : ''}` : ''}`;
        return row(
          item.id,
          item.name,
          item.effect,
          price,
          `rgb(${r} ${g} ${b})`,
          button(item.id, owned, p.coins >= item.coins && p.gems >= item.gems),
        );
      }),
    );
  }

  /** A hole begun: its number and name, its par, no strokes, and nothing else over the course. */
  started(info: HoleInfo) {
    this.holeOf.textContent = `Hole ${info.index + 1} of ${info.count}`;
    this.chipHole.textContent = `Hole ${info.index + 1}`;
    // a new hole is seen: the drawer of the last is shut
    this.setDrawer(false);
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
    this.chipStrokes.textContent = String(n);
    this.chipUnit.textContent = this.unit.textContent;
  }

  /** The word over the course, of its kind, which the stylesheet colours and pops in. */
  private callout(text: string, kind: Callout) {
    this.toast.textContent = text;
    this.toast.dataset.kind = kind;
    this.toast.hidden = false;
  }

  /** The ball into the water: a word for it, until the next stroke. */
  splash(waded = false) {
    this.callout(waded ? 'In the water! Waders: free' : 'In the water! +1', 'splash');
  }

  /** The ball out of bounds: a word for it, until the next stroke. */
  outOfBounds(waded = false) {
    this.callout(waded ? 'Out of bounds! Waders: free' : 'Out of bounds! +1', 'out');
  }

  /** The mulligan taken: a word for it, until the next stroke. */
  mulligan() {
    this.callout('Mulligan! Take it again', 'splash');
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
