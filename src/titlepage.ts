/**
 * The title screen's panel as the page keeps it: plain sky from the first paint (the stylesheet's own gradient, so
 * nothing flashes and no picture is fetched), let go as soon as the title's letters are drawn so the scene behind it
 * shows, by the fade `title.ts` says. The panel is handed in, and so is the player's word on motion, so none of it reaches
 * for a global. Without this the boot panel would be left to the stylesheet alone, and a page that stops on it with something
 * to say could not keep an exit still on its way from hiding the words.
 *
 * It also keeps the progress bar that stands on the sky: the stylesheet brings it into view half a second after the page
 * began (`BOOT_BAR`), and this writes how far the boot has got, a share that only grows. The bar goes with the panel (the
 * stylesheet), and is put away for a page that skips the title and for one that has stopped on the panel to say why.
 */
import { fades } from './title';

export interface TitlePage {
  /** The title is drawn: fade the panel away to it. Once. */
  leave(): void;
  /** The page has stopped on this panel with something to say: no exit may hide it again. */
  hold(): void;
  /** How far the boot has got, from nought to one: the bar's fill, which never goes back. */
  progress(share: number): void;
}

/**
 * The title's panel on `boot`, faded out by `leave`. The fade is the panel's own custom property, so the stylesheet holds no
 * figure of its own; it is none under reduced motion, and for a test's page (`off`, `?title=0`), which has no wish to wait.
 */
export function titlePage(
  boot: HTMLElement,
  off: boolean,
  reducedMotion: boolean,
  bar?: HTMLElement | null,
): TitlePage {
  boot.style.setProperty('--title-out', `${fades(reducedMotion || off).fadeOut}ms`);
  if (bar && off) bar.hidden = true;
  let held = false;
  let shown = 0;
  return {
    leave() {
      if (!held) boot.classList.add('gone');
    },
    hold() {
      held = true;
      if (bar) bar.hidden = true;
    },
    progress(share) {
      shown = Math.max(shown, Math.min(1, share));
      if (!bar) return;
      bar.style.setProperty('--p', String(shown));
      bar.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    },
  };
}
