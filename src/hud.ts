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
import { SCORE_KINDS, againstPar, scoreKind, scoreName } from './score';

/** Each kind of word the callout over the course says, which the stylesheet colours: a score's kind, or the water. */
export const CALLOUTS = [...SCORE_KINDS, 'splash'] as const;
export type Callout = (typeof CALLOUTS)[number];

export interface HudHandlers {
  again(): void;
  /** A course chosen on the start screen, by its name; and the card's way back to the screen. */
  choose(name: string): void;
  courses(): void;
  buy(id: string): void;
  equip(id: string): void;
}

/** What the shop needs to know of the save to show each club as for sale, owned, or in hand. */
export interface Purse {
  coins: number;
  gems: number;
  owned: readonly string[];
  club: string;
}

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
  }

  show() {
    this.panel.hidden = false;
    this.purse.hidden = false;
    this.help.hidden = false;
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
    for (const el of [this.panel, this.purse, this.help, this.card, this.shop, this.toast]) el.hidden = true;
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
    if (this.strokes.textContent !== String(n) && this.toast.dataset.kind === 'splash') this.toast.hidden = true;
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
