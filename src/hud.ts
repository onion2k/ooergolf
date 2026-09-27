/**
 * The words over the course, all in the page: the hole, the strokes and the
 * par; a word when a hole is done; the card when the round is over, with a
 * button for another; the coins and gems; and the shop. It is handed what to
 * show and never reads the game, so it is only ever what the game's events
 * said, and what the player presses goes back through the handlers it is
 * given.
 */
import type { Club } from './clubs';
import { againstPar, scoreName } from './score';

export interface HudHandlers {
  again(): void;
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
  private readonly hole = document.getElementById('holeName')!;
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

  constructor(
    private readonly handlers: HudHandlers,
    private readonly catalogue: readonly Club[],
  ) {
    document.getElementById('again')!.addEventListener('click', () => handlers.again());
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
        detail.textContent = `power ${club.hardest}${club.coins ? ` \u00b7 ${club.coins} coins` : ''}${club.gems ? ` + ${club.gems} gem${club.gems > 1 ? 's' : ''}` : ''}`;
        name.append(detail);
        const button = document.createElement('button');
        button.className = 'small';
        const owned = p.owned.includes(club.id);
        if (p.club === club.id) {
          button.textContent = 'In hand';
          button.disabled = true;
        } else if (owned) {
          button.textContent = 'Use';
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
    this.hole.textContent = `Hole ${info.index + 1} of ${info.count} · ${info.name}`;
    this.par.textContent = `\u00b7 par ${info.par}`;
    this.setStrokes(0);
    this.toast.hidden = true;
    this.card.hidden = true;
    this.shop.hidden = true;
  }

  setStrokes(n: number) {
    this.strokes.textContent = String(n);
  }

  /** A hole done: what the score is called, until the next begins. */
  done(strokes: number, par: number, pickedUp: boolean) {
    this.toast.textContent = scoreName(strokes, par, pickedUp);
    this.toast.hidden = false;
  }

  /** The round over: every hole's par and score, and the total against par. */
  finished(holes: readonly { name: string; par: number }[], card: readonly number[]) {
    this.toast.hidden = true;
    this.rows.replaceChildren(
      ...holes.map((h, i) => {
        const tr = document.createElement('tr');
        for (const text of [String(i + 1), h.name, String(h.par), String(card[i] ?? '')]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }),
    );
    const strokes = card.reduce((a, b) => a + b, 0),
      par = holes.reduce((a, h) => a + h.par, 0);
    this.total.textContent = `${strokes} (${againstPar(strokes, par)})`;
    this.card.hidden = false;
  }
}
