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
import { AISLES, type Aisle, type Item, type KitSlots } from './items';
import type { Mode } from './gesture';
import { helpText, windText, type Held } from './readout';
import { swatchOf } from './swatch';
import { SCORE_KINDS, againstPar, scoreKind, scoreName } from './score';
import type { PlayMode } from './career';
import type { Kind, Picker } from './picker';
import type { Grade, Tour } from './season';
import {
  cutLine,
  eventHeader,
  meritMove,
  placeText,
  promotionLine,
  seasonLine,
  stickerText,
  toParText,
} from './eventwords';

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
  /** The slot of an aisle emptied. */
  unequip(aisle: Aisle): void;
  /** The overhead button pressed: the view from above wanted on or off, the one it is not now. A drag is a pan while it is on. */
  overhead(on: boolean): void;
  /** The flag button pressed: the camera turned to face the cup. */
  flag(): void;
  /** The Retake button pressed: the kit's one free retake of the last stroke. */
  retake(): void;
  /** A club of the bag chosen on a golf hole, by its id. */
  club(id: string): void;
  /** The shape button pressed: the next shape in its cycle, from minus one (a draw) to one (a fade). */
  shape(value: number): void;
  /** The spin button pressed: the next spin in its cycle, from minus one (backspin) to one (topspin). */
  spin(value: number): void;
  /** The Install button pressed on the start screen: the browser's offer to install the page as an app, taken. */
  install(): void;
  /** Career or Free play chosen on the start screen. */
  mode(mode: PlayMode): void;
  /** The card of the career round kept pressed on the start screen: the round gone on with. */
  resume(): void;
  /** Enter pressed on a tour's event card: the fee paid and the event begun. Optional until the page is wired to the season. */
  enter?(tour: Tour): void;
  /** Practise pressed on a tour's event card: its course played for nothing. */
  practise?(tour: Tour): void;
  /** Next event pressed on the card at an event's end: back to the start screen and the season's next event. */
  next?(): void;
}

/** A row of an order of merit, a leaderboard or a result: a place, shared or not, a name, and whether it is the player. */
interface Row {
  place: number;
  tied: boolean;
  name: string;
  you: boolean;
}

/**
 * A tour's next event, as its card on the start screen shows it in the career: the grade and the event's place in the
 * season, the course, what it costs and pays, the coins there are to pay with, and the order of merit (the top four and you).
 */
export interface EventCard {
  tour: Tour;
  grade: Grade;
  /** The event's place in the season, from one. */
  event: number;
  events: number;
  course: string;
  par: number;
  fee: number;
  pot: number;
  /** How many places are paid. */
  paid: number;
  coins: number;
  merit: (Row & { points: number })[];
  /** How many of the order of merit go up at the season's end. */
  promoted: number;
  /** The hole (from one) the event's round kept goes on from, which Enter becomes Continue for; none when none is kept. */
  kept: number | null;
}

/** How the field stands as the player goes round an event: thru how many holes, the top three and you, and the cut. */
export interface Board {
  thru: number;
  rows: (Row & { toPar: number })[];
  /** The last paid place's score against par. */
  cut: number;
  /** How many of the field are behind the player. */
  behind: number;
}

/** What an event came to, on the card at its end: the place and prize, the field's top four and you, and the season. */
export interface Results {
  course: string;
  place: number;
  tied: boolean;
  prize: number;
  rows: (Row & { total: number })[];
  meritFrom: number;
  meritTo: number;
  seasonOver: boolean;
  promotedTo: Grade | null;
  title: boolean;
}

/** The tour a tab of the picker holds the events of. */
const tourOf = (kind: Kind): Tour => (kind === 'golf' ? 'golf' : 'mini');

/** A table's rows drawn: each a row of cells of the words given, the player's marked so the stylesheet can pick it out. */
function rowsOf(rows: readonly { you: boolean; cells: string[] }[]): HTMLTableRowElement[] {
  return rows.map((r) => {
    const tr = document.createElement('tr');
    if (r.you) tr.className = 'you';
    for (const text of r.cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  });
}

/**
 * What the start screen says of the career: whether rounds count in it, each course's record as words (none for a
 * course with no record), and the career round kept, by its course and the hole it goes on from (from one), or none.
 */
export interface StartCareer {
  mode: PlayMode;
  records: Readonly<Record<string, string>>;
  round: { course: string; hole: number } | null;
}

/** What the card says of the round besides its scores: each hole's best (null for none), and the prize, in the career. */
export interface CardCareer {
  bests: readonly (number | null)[];
  /** The coins the round's prize paid, or null where there was none (free play, a round no course's). */
  prize: number | null;
  record: boolean;
  free: boolean;
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

/** What the shop calls each aisle. */
const AISLE_NAMES: Record<Aisle, string> = { club: 'Clubs', ball: 'Balls', accessory: 'Accessories' };

/** What the shop needs to know of the save to show each item as for sale, owned, or equipped. */
export interface Purse {
  coins: number;
  gems: number;
  owned: readonly string[];
  /** The kit worn: each slot '' for none. */
  kit: KitSlots;
}

export interface HoleInfo {
  index: number;
  count: number;
  name: string;
  par: number;
}

/** What the None row of each aisle says: playing with nothing from it is the plain game, not going without. */
const NONE_WORDS = { club: 'The bag as it comes.', ball: 'The plain white ball.', accessory: 'Nothing worn.' } as const;

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
  private readonly shopCoins = document.getElementById('shopCoins')!;
  private readonly shopGems = document.getElementById('shopGems')!;
  private readonly shopNote = document.getElementById('shopNote')!;
  private readonly tabs = AISLES.map((aisle) => document.getElementById(`shopTab-${aisle}`) as HTMLButtonElement);
  /** The aisle the shop shows, which is remembered while the page is open and not after: the clubs when it opens. */
  private tab: Aisle = 'club';
  /** What the shop was last told of the save, so a tab pressed can show its rows without waiting for the game to tell again. */
  private saved: Purse | null = null;
  private readonly start = document.getElementById('start')!;
  /** The Install button on the start screen, shown only while the browser offers to install (`showInstall`). */
  private readonly installButton = document.getElementById('install') as HTMLButtonElement;
  /** Whether the start screen is up but held back, out of sight, until the title's letters have landed: everything else is away as if it showed. */
  private held = false;
  private readonly startWords = document.getElementById('startWords')!;
  private readonly modeButton = document.getElementById('playMode') as HTMLButtonElement;
  /** The mode the start screen's button shows, which a press asks for the other of. */
  private modeShown: PlayMode = 'career';
  /** The course whose card goes on with the career round kept, or '' for none: its card is Continue. */
  private going = '';
  private readonly prize = document.getElementById('cardPrize')!;
  /** The career as the start screen last drew it: the mode, each course's record in words, and the round kept. */
  private career: StartCareer = { mode: 'career', records: {}, round: null };
  /** The course picker's parts: the two tabs, the arrows, the card in view and Play; what they show is the picker's say. */
  private readonly kindTabs: Record<Kind, HTMLButtonElement> = {
    golf: document.getElementById('tab-golf') as HTMLButtonElement,
    minigolf: document.getElementById('tab-minigolf') as HTMLButtonElement,
  };
  private readonly pickerPanel = document.getElementById('picker')!;
  private readonly courseCard = document.getElementById('courseCard')!;
  private readonly courseName = document.getElementById('courseName')!;
  private readonly courseStats = document.getElementById('courseStats')!;
  private readonly coursePips = document.getElementById('coursePips')!;
  private readonly courseBadge = document.getElementById('courseBadge')!;
  private readonly courseStrip = document.getElementById('courseStrip')!;
  private readonly courseDots = document.getElementById('courseDots')!;
  private readonly playButton = document.getElementById('playCourse') as HTMLButtonElement;
  /** The tournament's parts of the start screen: the line over the event's name, the order of merit, Enter and Practise. */
  private readonly courseEvent = document.getElementById('courseEvent')!;
  private readonly merit = document.getElementById('merit')!;
  private readonly meritRows = document.getElementById('meritRows')!;
  private readonly meritLine = document.getElementById('meritLine')!;
  private readonly enterButton = document.getElementById('enterEvent') as HTMLButtonElement;
  private readonly practiseButton = document.getElementById('practise') as HTMLButtonElement;
  /** Each tour's next event, as the start screen shows it on that tour's tab; none in free play. */
  private events: Partial<Record<Tour, EventCard>> | null = null;
  /** The leaderboard in the hole's panel, and what it last drew, so the page may say it every frame and it is written only when it changes. */
  private readonly board = document.getElementById('board')!;
  private readonly boardHead = document.getElementById('boardHead')!;
  private readonly boardRows = document.getElementById('boardRows')!;
  private readonly boardCut = document.getElementById('boardCut')!;
  private boardDrawn = '';
  /** The card's heading, and what it says of an event at its end. */
  private readonly cardHeading = this.card.querySelector('h2')!;
  private readonly cardResults = document.getElementById('cardResults')!;
  private readonly resultRows = document.getElementById('resultRows')!;
  private readonly meritMoved = document.getElementById('meritMove')!;
  private readonly seasonWords = document.getElementById('seasonLine')!;
  private readonly againButton = document.getElementById('again')!;
  private readonly nextButton = document.getElementById('nextEvent')!;
  /** The picker the start screen draws, handed in with `showStart`; none until then. */
  private picker: Picker | null = null;
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
  /** The id of the club the bag shows in hand, so the page may say it every frame and the bag is written only when it changes. */
  private active: string | null = null;
  /** The clubs the picker has, none on a hole of minigolf; and what a drag does, which the help says. */
  private bagList: readonly BagInfo[] = [];
  private mode: Mode = 'aim';
  /** How the drag now held was begun, or none: what the help says how to take back. */
  private gripped: Held = null;
  /** The shape and the spin the buttons show, and the turn the wind's arrow was last written at, so each is written only when it changes. */
  private shapeShown = 0;
  private spinShown = 0;
  /** Which of the putt's shape and spin buttons a hole of minigolf shows (2 for the shape, 1 for the spin), or -1 for none said yet: so the page may say it every frame. */
  private puttShown = -1;
  private windTurn = NaN;

  constructor(
    private readonly handlers: HudHandlers,
    private readonly catalogue: readonly Item[],
  ) {
    document.getElementById('again')!.addEventListener('click', () => handlers.again());
    this.nextButton.addEventListener('click', () => handlers.next?.());
    this.enterButton.addEventListener('click', () => {
      const card = this.eventShown();
      if (!card) return;
      // the event's round kept is gone on with, and its fee is not asked again
      if (card.kept !== null) handlers.resume();
      else handlers.enter?.(card.tour);
    });
    this.practiseButton.addEventListener('click', () => {
      const card = this.eventShown();
      if (card) handlers.practise?.(card.tour);
    });
    document.getElementById('cardCourses')!.addEventListener('click', () => handlers.courses());
    this.installButton.addEventListener('click', () => handlers.install());
    this.modeButton.addEventListener('click', () => handlers.mode(this.modeShown === 'career' ? 'free' : 'career'));
    // the course picker: the tabs are a tablist (a press chooses a kind, the arrow keys, home and end walk along them), the
    // arrows step the tab's courses either way and wrap, the arrow keys anywhere else on the screen do the same, and Play
    // begins the course in view
    const kinds: Kind[] = ['golf', 'minigolf'];
    kinds.forEach((kind, i) => {
      const tab = this.kindTabs[kind];
      tab.addEventListener('click', () => this.pressKind(kind));
      tab.addEventListener('keydown', (e) => {
        const to =
          e.key === 'ArrowRight'
            ? i + 1
            : e.key === 'ArrowLeft'
              ? i - 1
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? 1
                  : -1;
        if (to < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const next = kinds[(to + kinds.length) % kinds.length];
        if (this.pressKind(next)) this.kindTabs[next].focus();
      });
    });
    document.getElementById('coursePrev')!.addEventListener('click', () => this.stepCourse(-1));
    document.getElementById('courseNext')!.addEventListener('click', () => this.stepCourse(1));
    this.start.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      this.stepCourse(e.key === 'ArrowRight' ? 1 : -1);
    });
    // Play begins the course in view, or goes on with the career round kept when that is the course in view (Continue)
    this.playButton.addEventListener('click', () => {
      if (!this.picker) return;
      const name = this.picker.shown().name;
      if (this.going === name) handlers.resume();
      else handlers.choose(name);
    });
    const open = () => {
      this.shop.hidden = false;
    };
    document.getElementById('shopOpen')!.addEventListener('click', open);
    document.getElementById('cardShop')!.addEventListener('click', open);
    document.getElementById('shopClose')!.addEventListener('click', () => {
      this.shop.hidden = true;
    });
    // the tabs are a tablist: a press chooses an aisle, and the arrow keys, home and end walk along them
    this.tabs.forEach((tab, i) => {
      tab.textContent = AISLE_NAMES[AISLES[i]];
      tab.addEventListener('click', () => this.pressTab(AISLES[i]));
      tab.addEventListener('keydown', (e) => {
        const to =
          e.key === 'ArrowRight'
            ? i + 1
            : e.key === 'ArrowLeft'
              ? i - 1
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? AISLES.length - 1
                  : -1;
        if (to < 0) return;
        e.preventDefault();
        const next = (to + AISLES.length) % AISLES.length;
        this.pressTab(AISLES[next]);
        this.tabs[next].focus();
      });
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
    this.writeHelp();
  }

  /**
   * A drag held, and how it was begun, or none: the help says how to take it back while one is (`helpText`), and `data-aiming`
   * on it is what the stylesheet lifts it by, so that it is seen on a phone, which has no help the rest of the time. Written only when
   * it changes, so the page may say it every frame; overhead says nothing of it, since a drag from there is a pan.
   */
  setAiming(gripped: Held) {
    if (gripped === this.gripped) return;
    this.gripped = gripped;
    this.writeHelp();
  }

  /** The help as it is now: what a drag does, or, while one is held, how to take it back. */
  private writeHelp() {
    const overhead = this.mode === 'overhead';
    this.help.textContent = helpText({ overhead, swing: this.bagList.length > 0, held: this.gripped });
    if (this.gripped && !overhead) this.help.dataset.aiming = this.gripped;
    else delete this.help.dataset.aiming;
  }

  /** The help as drawn: its words and whether it is the one that says how to take a drag back, which the test API reads. */
  helpDrawn(): { text: string; aiming: Held } {
    const a = this.help.dataset.aiming;
    return { text: this.help.textContent, aiming: a === 'touch' || a === 'pointer' ? a : null };
  }

  /**
   * The picker of a golf hole's clubs, with `active` in hand, or put away for a hole of minigolf: one pill a club,
   * pressed through `club`, and above them the club in hand and how far it carries. Shown with the course's other
   * panels, and away under the start screen.
   */
  setBag(clubs: readonly BagInfo[] | null, active = '') {
    this.bagList = clubs ?? [];
    this.setOverhead(this.mode === 'overhead');
    // a golf hole's shaping is both buttons or none; a hole of minigolf says which it shows, with `setPuttShaping`
    this.shapeButton.hidden = this.spinButton.hidden = false;
    this.puttShown = -1;
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
    this.active = null;
    this.setClub(active);
    this.bag.hidden = this.startUp;
  }

  /**
   * The shape and spin buttons of a putt on a hole of minigolf, for a kit that gives them: the bag's panel up with only them
   * in it (no clubs, and "Putter" over them), the shape button if the kit bends and the spin button if it spins, and the panel
   * away if it does neither. Written only when it changes, so the page may say it every frame; away under the start screen.
   */
  setPuttShaping(shape: boolean, spin: boolean) {
    const shown = (shape ? 2 : 0) + (spin ? 1 : 0);
    if (shown === this.puttShown) return;
    this.puttShown = shown;
    this.shapeButton.hidden = !shape;
    this.spinButton.hidden = !spin;
    this.shaping.hidden = !shown;
    this.bagInfo.textContent = shown ? 'Putter' : '';
    this.bag.hidden = !shown || this.startUp;
  }

  /** The club in hand: its pill stands up, and what it is and how far it carries is said above them. */
  setClub(active: string) {
    if (active === this.active) return;
    this.active = active;
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
    this.mapPanel.hidden = this.startUp;
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
    this.bag.hidden = !(this.bagList.length || this.puttShown > 0);
    this.mapPanel.hidden = !this.mapBase;
  }

  /** A tab pressed: the kind shown, or nothing for a kind with no course (its tab is disabled, so a press cannot reach it). */
  private pressKind(kind: Kind): boolean {
    if (!this.picker || !this.picker.courses(kind).length) return false;
    this.picker.tab(kind);
    this.drawPicker();
    return true;
  }

  /** An arrow pressed: the next course of the tab, or the one before; nothing while the tab shows an event, whose course is the season's. */
  private stepCourse(by: number): void {
    if (!this.picker || this.eventShown()) return;
    this.picker.step(by);
    this.drawPicker();
  }

  /** The picker as it stands, drawn: the tabs' state, the course in view with its figures, its badge and its strip of holes, the dots, and the card's colour. */
  private drawPicker(): void {
    const picker = this.picker;
    if (!picker) return;
    // a tab with an event shows the event's course, which the season chose and the arrows cannot step from
    const event = this.eventShown();
    if (event && picker.shown().name !== event.course && picker.has(event.course)) picker.show(event.course);
    const shown = picker.shown();
    for (const kind of ['golf', 'minigolf'] as const) {
      const tab = this.kindTabs[kind];
      const on = picker.kind === kind;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.disabled = !picker.courses(kind).length;
    }
    this.pickerPanel.setAttribute('aria-labelledby', this.kindTabs[picker.kind].id);
    this.courseName.textContent = shown.name;
    // the figures as tiles, a word over a number: its holes, its par and, on golf, its length
    const stats: [string, string][] = [
      ['Holes', String(shown.holes)],
      ['Par', String(shown.par)],
    ];
    if (shown.golf) stats.push(['Yards', shown.yards.toLocaleString('en-GB')]);
    this.courseStats.replaceChildren(
      ...stats.map(([word, figure]) => {
        const tile = document.createElement('span');
        const label = document.createElement('i');
        label.textContent = word;
        tile.append(label, figure);
        return tile;
      }),
    );
    // how hard it is, as a pip for each course of the tab up to its place, since the courses stand easiest first
    this.coursePips.setAttribute('aria-label', `Difficulty ${shown.index + 1} of ${shown.count}`);
    this.coursePips.replaceChildren(
      ...Array.from({ length: shown.count }, (_, k) => {
        const pip = document.createElement('em');
        if (k <= shown.index) pip.className = 'on';
        return pip;
      }),
    );
    // one badge: the hole the round kept goes on from, or the course's record in the career, or the best round its
    // holes' bests add up to, or that it has not been played
    const { records } = this.career;
    const record = Object.hasOwn(records, shown.name) ? records[shown.name] : '';
    const round = this.going === shown.name ? this.career.round : null;
    const [badge, kind] = round
      ? [`On hole ${round.hole}`, 'round']
      : record
        ? [record, 'record']
        : shown.best !== null
          ? [`Best ${shown.best}`, 'best']
          : ['Not yet played', 'none'];
    this.courseBadge.textContent = badge;
    this.courseBadge.dataset.kind = kind;
    // the strip: each hole from above with its par; the pictures stand beside the page, so the path is relative and a
    // page served under a prefix finds them
    this.courseStrip.replaceChildren(
      ...shown.strip.map((hole, k) => {
        const figure = document.createElement('figure');
        const cell = document.createElement('div');
        const picture = document.createElement('img');
        picture.src = `previews/${shown.slug}/${k + 1}.png`;
        picture.width = hole.width;
        picture.height = hole.height;
        picture.alt = '';
        picture.decoding = 'async';
        cell.append(picture);
        const caption = document.createElement('figcaption');
        caption.textContent = `${k + 1} · p${hole.par}`;
        figure.append(cell, caption);
        return figure;
      }),
    );
    // Play goes on with the round kept when its course is the one in view, and says so
    this.playButton.textContent = round ? 'Continue' : 'Play course';
    this.playButton.setAttribute(
      'aria-label',
      round ? `Continue ${shown.name} from hole ${round.hole}` : `Play ${shown.name}`,
    );
    this.courseDots.replaceChildren(
      ...Array.from({ length: shown.count }, (_, k) => {
        const dot = document.createElement('i');
        if (k === shown.index) dot.className = 'on';
        return dot;
      }),
    );
    // the six colours go round the tab's courses, so a course keeps the colour its card had
    this.courseCard.dataset.colour = String(shown.index % 6);
    this.drawEvent(event?.course === shown.name ? event : null);
  }

  /** The tour's event a tab shows, in the career: none in free play, or for a tour with no event to show. */
  private eventShown(): EventCard | null {
    if (!this.picker || !this.events) return null;
    return this.events[tourOf(this.picker.kind)] ?? null;
  }

  /**
   * The picker as an event's card, or as itself: in an event, the line over the course's name, its par, entry and purse as
   * the tiles, what the event is in place of the pips and the badge, the order of merit beside it, and Enter and Practise in
   * place of Play, with the arrows and the dots away (`data-event` on the screen, which the stylesheet reads). Without one,
   * every part of it is put back as the picker drew it.
   */
  private drawEvent(card: EventCard | null): void {
    const on = card !== null;
    if (on) this.start.dataset.event = '';
    else delete this.start.dataset.event;
    this.courseEvent.hidden = !on;
    this.merit.hidden = !on;
    this.enterButton.hidden = !on;
    this.practiseButton.hidden = !on;
    this.playButton.hidden = on;
    this.coursePips.hidden = on;
    if (!card) return;
    this.courseEvent.textContent = eventHeader(card.grade, card.event, card.events);
    const stats: [string, string][] = [
      ['Par', String(card.par)],
      ['Entry', card.fee === 0 ? 'Free' : String(card.fee)],
      ['Purse', String(card.pot)],
    ];
    this.courseStats.replaceChildren(
      ...stats.map(([word, figure]) => {
        const tile = document.createElement('span');
        const label = document.createElement('i');
        label.textContent = word;
        tile.append(label, figure);
        return tile;
      }),
    );
    this.courseBadge.textContent = `12 in the field · top ${card.paid} paid · one go`;
    this.courseBadge.dataset.kind = 'event';
    // a season with nothing played has no order yet, which is said rather than left as an empty table
    this.meritRows.replaceChildren(
      ...(card.merit.length
        ? rowsOf(card.merit.map((r) => ({ you: r.you, cells: [placeText(r.place, r.tied), r.name, String(r.points)] })))
        : rowsOf([{ you: false, cells: ['No events played yet'] }])),
    );
    this.meritLine.textContent = promotionLine(card.grade, card.promoted);
    const short = card.kept === null && card.coins < card.fee;
    // a fee the coins do not cover is said on the button itself, refused, so the screen takes no more height for it (it fits
    // under the title's word on a desk and a phone); a club event's fee is nothing, which the button says too
    this.enterButton.textContent =
      card.kept !== null
        ? `Continue · hole ${card.kept}`
        : short
          ? `Need ${card.fee} coins`
          : card.fee === 0
            ? 'Enter · free'
            : `Enter · ${card.fee}`;
    this.enterButton.disabled = short;
    this.enterButton.setAttribute(
      'aria-label',
      card.kept !== null
        ? `Continue ${card.course} from hole ${card.kept}`
        : short
          ? `Enter ${card.course} for ${card.fee} coins: you have ${card.coins}`
          : card.fee === 0
            ? `Enter ${card.course} for nothing`
            : `Enter ${card.course} for ${card.fee} coins`,
    );
    this.practiseButton.setAttribute('aria-label', `Practise ${card.course} for nothing`);
  }

  /**
   * Each tour's next event, in the career, which its tab shows in place of the picker's course (mock 1 of 15 October
   * 2026); or none, in free play, and the picker is exactly as it was.
   */
  setEvents(cards: Partial<Record<Tour, EventCard>> | null): void {
    this.events = cards;
    this.drawPicker();
  }

  /**
   * The leaderboard in the hole's panel while an event is played (mock 2a): thru how many holes, the top three and you, and
   * the cut; on a phone it is in the drawer with the rest of the hole's words. None away from an event. Written only when
   * it changes, so the page may say it every frame.
   */
  setBoard(board: Board | null): void {
    const key = board ? JSON.stringify(board) : '';
    if (key === this.boardDrawn) return;
    this.boardDrawn = key;
    this.board.hidden = !board;
    if (!board) return;
    this.boardHead.textContent = `Leaderboard · thru ${board.thru}`;
    this.boardRows.replaceChildren(
      ...rowsOf(
        board.rows.map((r) => ({ you: r.you, cells: [placeText(r.place, r.tied), r.name, toParText(r.toPar)] })),
      ),
    );
    this.boardCut.textContent = cutLine(board.cut, board.behind);
  }

  /** The leaderboard as it was last drawn, read back for the tests: its head, rows and foot, or null while it is away. */
  boardShown(): { head: string; rows: string[][]; cut: string } | null {
    if (this.board.hidden) return null;
    return {
      head: this.boardHead.textContent,
      rows: Array.from(this.boardRows.querySelectorAll('tr'), (tr) => Array.from(tr.cells, (td) => td.textContent)),
      cut: this.boardCut.textContent,
    };
  }

  /**
   * The start screen, over the course: the course picker (15 October 2026; it was a card for each course, which were cramped
   * at nine), a tab for proper golf and one for minigolf, since the two are played so differently and a player chooses between
   * them first, and one course of the tab in view at a time with its preview and its figures, stepped by the arrows, and Play.
   * What is shown is the `Picker`'s say, drawn here and never worked out again, with the career's words on it (`setCareer`:
   * the mode button beside Play, a course's record as its first pill, and the round kept, whose course the picker opens on
   * and whose Play is Continue). Everything else over the course is put away while it is up; Play goes back through
   * `choose` with the name of the course in view, or `resume` for the round kept.
   */
  showStart(picker: Picker, wait = false, career: StartCareer = { mode: 'career', records: {}, round: null }) {
    this.picker = picker;
    this.setCareer(career);
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
    // held back, it is still the screen that is up, which every other panel is put away for, and shows when it is let go
    this.held = wait;
    this.start.hidden = wait;
    this.setDrawer(false);
  }

  /**
   * The start screen's word of the career: the mode, on a button that cycles between the two as the bag's shape does,
   * and what choosing a course does in it; each card's record, which stands where its count of holes stood, since a card
   * has room for two pills on a phone and the record says more; and the career round kept (none in free play, which
   * goes on with nothing), whose course's card says the hole it goes on from and is the way to go on with it. There is
   * no Continue button of its own, since a phone's screen under the title has no row to spare for one.
   */
  /**
   * The career's words on the start screen: the mode button, the heading's line, and the round kept, whose course the
   * picker opens on so that Continue is the first thing a player sees (in free play no round is going on with). Drawn
   * again whenever the career changes, since the pills and Play read it.
   */
  setCareer(career: StartCareer) {
    this.career = career;
    this.modeShown = career.mode;
    const free = career.mode === 'free';
    // a switch, named Career mode, on in the career and off in free play: its state is what it says, never what a press would do
    this.modeButton.setAttribute('aria-checked', String(!free));
    this.modeButton.dataset.mode = career.mode;
    this.startWords.textContent = free ? 'Choose a course to play for nothing' : 'Choose a course';
    const round = free ? null : career.round;
    this.going = round?.course ?? '';
    if (round && this.picker?.has(round.course)) this.picker.show(round.course);
    this.drawPicker();
  }

  /** Whether the start screen is up, in sight or held back for the title's letters. */
  private get startUp(): boolean {
    return this.held || !this.start.hidden;
  }

  /** A start screen held back is shown, and springs in as a panel does. */
  releaseStart() {
    if (!this.held) return;
    this.held = false;
    this.start.hidden = false;
  }

  /** The start screen put away, and the course's words shown. */
  /** The browser offers to install, or has stopped offering: the Install button shown on the start screen, or put away. */
  showInstall(on: boolean) {
    this.installButton.hidden = !on;
  }

  hideStart() {
    this.held = false;
    this.start.hidden = true;
    this.show();
  }

  /** The shop shows `aisle`: its tab chosen and its rows drawn. */
  pressTab(aisle: Aisle) {
    this.tab = aisle;
    this.items.scrollTop = 0;
    if (this.saved) this.setPurse(this.saved);
  }

  /** The coins and gems, and the shop's items as the save now has them: the chosen aisle's row for no item, then each item for sale in it. */
  setPurse(p: Purse) {
    this.saved = p;
    this.coins.textContent = String(p.coins);
    this.gems.textContent = String(p.gems);
    this.shopCoins.textContent = String(p.coins);
    this.shopGems.textContent = String(p.gems);
    const aisle = this.tab;
    this.tabs.forEach((tab, i) => {
      const chosen = AISLES[i] === aisle;
      tab.setAttribute('aria-selected', String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
    });
    this.items.setAttribute('aria-labelledby', `shopTab-${aisle}`);
    // a ball's ground figures are built into the hole's world as it begins, so a new one takes hold at the next hole; a club is read at the strike
    this.shopNote.hidden = aisle !== 'ball';
    const row = (
      id: string,
      name: string,
      effect: string,
      price: string,
      swatchStyle: string,
      button: HTMLButtonElement,
    ) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.dataset.item = id;
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = swatchStyle;
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
    /** The row's button: a badge for the one worn in its aisle, Equip for one owned, and Buy for one that is not. */
    const button = (id: string, owned: boolean, can: boolean) => {
      const b = document.createElement('button');
      if (p.kit[aisle] === id) {
        // not a button to press but a badge, which the stylesheet draws as one
        b.textContent = 'Equipped';
        b.className = 'held';
        b.disabled = true;
      } else if (owned) {
        b.textContent = 'Equip';
        b.className = 'quiet';
        b.addEventListener('click', () => (id === '' ? this.handlers.unequip(aisle) : this.handlers.equip(id)));
      } else {
        b.textContent = 'Buy';
        b.disabled = !can;
        b.addEventListener('click', () => this.handlers.buy(id));
      }
      return b;
    };
    this.items.replaceChildren(
      row('', 'None', NONE_WORDS[aisle], '', 'transparent', button('', true, true)),
      ...this.catalogue
        .filter((item) => item.aisle === aisle)
        .map((item) => {
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
            swatchOf(item),
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
  finished(
    holes: readonly { name: string; par: number }[],
    card: readonly number[],
    career: CardCareer = { bests: [], prize: null, record: false, free: false },
    results: Results | null = null,
  ) {
    this.toast.hidden = true;
    this.rows.replaceChildren(
      ...holes.map((h, i) => {
        const tr = document.createElement('tr');
        for (const text of [String(i + 1), h.name, String(h.par), String(career.bests[i] ?? '–')]) {
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
    // what the round won: its prize, a new record's word as a sticker, or free play's nothing
    this.prize.hidden = !career.free && career.prize === null && !results;
    this.prize.dataset.record = String(career.record || results !== null);
    this.drawResults(results);
    if (results) {
      // an event's sticker is its place and what it won (its share and any record's bonus, which the prize says in all)
      this.prize.textContent = stickerText(results.place, results.tied, career.prize ?? results.prize);
      if (career.record) {
        const record = document.createElement('span');
        record.textContent = 'New course record!';
        this.prize.append(record);
      }
    } else if (career.free) this.prize.textContent = 'Free play: nothing won';
    else {
      this.prize.textContent = `Prize ${career.prize} coins`;
      if (career.record) {
        const record = document.createElement('span');
        record.textContent = 'New course record!';
        this.prize.append(record);
      }
    }
    this.card.hidden = false;
  }

  /**
   * The card's part for an event (mock 3), or the card as it always was: the course as its heading, the field's top four and
   * you, how the order of merit moved and what the season's end meant, and Next event in place of Play again.
   */
  private drawResults(results: Results | null): void {
    this.cardHeading.textContent = results ? results.course : 'The card';
    this.cardResults.hidden = !results;
    // the card is laid out wider on a desk while it shows an event's field beside its scores (`data-results`)
    if (results) this.card.dataset.results = '';
    else delete this.card.dataset.results;
    this.againButton.hidden = results !== null;
    this.nextButton.hidden = results === null;
    if (!results) return;
    this.resultRows.replaceChildren(
      ...rowsOf(
        results.rows.map((r) => ({ you: r.you, cells: [placeText(r.place, r.tied), r.name, String(r.total)] })),
      ),
    );
    this.meritMoved.textContent = meritMove(results.meritFrom, results.meritTo);
    const line = seasonLine(results.seasonOver, results.promotedTo, results.title);
    this.seasonWords.hidden = line === '';
    this.seasonWords.textContent = line;
  }
}
