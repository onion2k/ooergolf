/**
 * The words over the course, all in the page: the hole, the strokes and the
 * par; a word when a hole is done; and the card when the round is over, with
 * a button for another. It is handed what to show and never reads the game,
 * so it is only ever what the game's events said.
 */
import { againstPar, scoreName } from './score';

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

  constructor(onAgain: () => void) {
    document.getElementById('again')!.addEventListener('click', onAgain);
  }

  show() {
    this.panel.hidden = false;
  }

  /** A hole begun: its number and name, its par, no strokes, and nothing else over the course. */
  started(info: HoleInfo) {
    this.hole.textContent = `Hole ${info.index + 1} of ${info.count} · ${info.name}`;
    this.par.textContent = `\u00b7 par ${info.par}`;
    this.setStrokes(0);
    this.toast.hidden = true;
    this.card.hidden = true;
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
