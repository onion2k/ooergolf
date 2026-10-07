/**
 * The title screen as the page shows it: the picture on the boot panel, faded in once it is drawable and out once the
 * game is ready, by the times `title.ts` says. The panel and the picture are handed in, and so are the clock and the
 * player's word on motion, so none of it reaches for a global. Without this a game that boots in a blink would flash the
 * picture, and one on a slow network would show it half drawn.
 */
import { fades, leaveDelay } from './title';

export interface TitlePage {
  /** The game is ready: fade the title out, when it has been seen in full. Once. */
  leave(): void;
  /** The page has stopped on this panel with something to say: no exit still to come may hide it again. */
  hold(): void;
}

/**
 * Shows the title on `boot`: its `img` is faded in when it has decoded (`shown` on the panel), and left out of it if it
 * cannot be, or if `off` (a test's page, which has no wish to wait on a picture). The fades are the panel's own custom
 * properties, so the stylesheet holds no figure of its own.
 */
export function titlePage(
  boot: HTMLElement,
  img: HTMLImageElement,
  off: boolean,
  reducedMotion: boolean,
  now: () => number,
): TitlePage {
  // a page that skips the title has no fade to wait for either, and goes at once as the panel always did for it
  const reduced = reducedMotion || off;
  const { fadeIn, fadeOut } = fades(reduced);
  boot.style.setProperty('--title-in', `${fadeIn}ms`);
  boot.style.setProperty('--title-out', `${fadeOut}ms`);
  let shownAt: number | null = null;
  let left = false;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (off) {
    img.hidden = true;
  } else {
    void img.decode().then(
      () => {
        // a picture that comes after the game is ready is not shown at all: a title is never what a player waits on
        if (left) return;
        shownAt = now();
        boot.classList.add('shown');
      },
      () => {
        // a picture that is not there leaves the panel plain: the game does not wait on it
        img.hidden = true;
      },
    );
  }
  const go = () => {
    if (!held) boot.classList.add('gone');
  };
  return {
    leave() {
      if (shownAt === null) {
        // not drawable yet, or never: nothing has been seen, so there is nothing to hold for
        left = true;
        go();
        return;
      }
      const wait = leaveDelay(shownAt, now(), reduced);
      if (wait <= 0) go();
      else timer = setTimeout(go, wait);
    },
    hold() {
      held = true;
      clearTimeout(timer);
    },
  };
}
